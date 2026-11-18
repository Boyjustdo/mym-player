import { resolveApiUrl } from "./url";
import type {
  CreatePlaybackRequest,
  CreatePlaybackResponse,
  PlatformInfo,
  PlaybackTask,
  SearchItem,
} from "./types";

/**
 * Thin fetch helper. Do not forge browser headers (sec-ch-ua, Referer, etc.).
 * Do not forward Cookie / Authorization — API is anonymous.
 */
async function requestJson<T>(
  urlOrPath: string,
  init?: RequestInit,
): Promise<{ data: T; status: number }> {
  const url = resolveApiUrl(urlOrPath);
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = text || res.statusText;
    try {
      const err = JSON.parse(text) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch {
      // keep raw text
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  if (!text) {
    throw new Error(`HTTP ${res.status}: empty body`);
  }
  return { data: JSON.parse(text) as T, status: res.status };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** GET /api/v1/platforms */
export async function listPlatforms(): Promise<PlatformInfo[]> {
  const { data } = await requestJson<PlatformInfo[]>("/api/v1/platforms");
  return data;
}

/** GET /api/v1/search?platform&q&limit — response is SearchItem[]. */
export async function searchTracks(params: {
  q: string;
  platform: string;
  limit?: number;
}): Promise<SearchItem[]> {
  const query = new URLSearchParams();
  query.set("platform", params.platform);
  query.set("q", params.q);
  query.set("limit", String(params.limit ?? 10));

  const { data } = await requestJson<SearchItem[]>(
    `/api/v1/search?${query.toString()}`,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * POST /api/v1/playbacks — omit streaming_mode for standard download path.
 * Accepts 200 (already completed) or 202 (queued/processing/streaming).
 */
export async function createPlayback(
  body: CreatePlaybackRequest,
): Promise<CreatePlaybackResponse> {
  const payload: CreatePlaybackRequest = {
    platform: body.platform,
    query: body.query.trim(),
    selected_id: body.selected_id || undefined,
    quality: body.quality ?? "high",
    include_cover: body.include_cover ?? true,
  };

  const { data } = await requestJson<CreatePlaybackResponse>(
    "/api/v1/playbacks",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return data;
}

/** GET status_url → PlaybackTask */
export async function getPlaybackStatus(
  statusUrl: string,
): Promise<PlaybackTask> {
  const { data } = await requestJson<PlaybackTask>(statusUrl);
  return data;
}

function hasAudioUrl(task: PlaybackTask, createResponse?: CreatePlaybackResponse): boolean {
  return Boolean(task.audio_url?.trim() || createResponse?.audio_url?.trim());
}

/**
 * Poll until the track is playable online: `streaming` or `completed` with audio_url.
 * Still stops on `failed`. Does not treat streaming as "cache-ready".
 */
export async function waitForPlaybackPlayable(
  statusUrl: string,
  options?: {
    onUpdate?: (task: PlaybackTask) => void;
    signal?: AbortSignal;
    createResponse?: CreatePlaybackResponse;
  },
): Promise<PlaybackTask> {
  let delayMs = 800;
  const maxDelayMs = 4000;

  while (true) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const task = await getPlaybackStatus(statusUrl);
    options?.onUpdate?.(task);

    if (task.status === "failed") {
      throw new Error(task.error?.trim() || "播放任务失败");
    }

    if (
      (task.status === "streaming" || task.status === "completed") &&
      hasAudioUrl(task, options?.createResponse)
    ) {
      return task;
    }

    await sleep(delayMs, options?.signal);
    delayMs = Math.min(Math.round(delayMs * 1.25), maxDelayMs);
  }
}

/**
 * Continue polling until completed or failed (for stable offline cache).
 */
export async function waitForPlaybackCompleted(
  statusUrl: string,
  options?: {
    onUpdate?: (task: PlaybackTask) => void;
    signal?: AbortSignal;
  },
): Promise<PlaybackTask> {
  let delayMs = 1000;
  const maxDelayMs = 5000;

  while (true) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const task = await getPlaybackStatus(statusUrl);
    options?.onUpdate?.(task);

    if (task.status === "completed") {
      return task;
    }
    if (task.status === "failed") {
      throw new Error(task.error?.trim() || "播放任务失败");
    }

    await sleep(delayMs, options?.signal);
    delayMs = Math.min(Math.round(delayMs * 1.25), maxDelayMs);
  }
}

/**
 * Prefer audio_url from the latest task (keep rev query params).
 * Absolute media-host URLs are left unchanged.
 */
export function pickAudioUrl(
  task: PlaybackTask,
  createResponse?: CreatePlaybackResponse,
): string {
  const fromTask = task.audio_url?.trim();
  if (fromTask) return resolveApiUrl(fromTask);
  const fromCreate = createResponse?.audio_url?.trim();
  if (fromCreate) return resolveApiUrl(fromCreate);
  throw new Error("任务缺少 audio_url");
}

/** Cache file stem: quality-aware, prefer server playback id. */
export function cacheFileStem(args: {
  playbackId?: string | null;
  platform: string;
  trackId: string;
  quality: string;
}): string {
  if (args.playbackId?.trim()) {
    return args.playbackId.trim();
  }
  return `${args.platform}--${args.trackId}--${args.quality}`;
}
