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

/**
 * Poll status_url until completed or failed.
 * Do not treat `streaming` as done. Stop and surface error on failed.
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

  // First response may already be completed (HTTP 200 create path).
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
 * Prefer audio_url from the latest completed task (keep rev query params).
 */
export function pickAudioUrl(
  task: PlaybackTask,
  createResponse?: CreatePlaybackResponse,
): string {
  const fromTask = task.audio_url?.trim();
  if (fromTask) return resolveApiUrl(fromTask);
  const fromCreate = createResponse?.audio_url?.trim();
  if (fromCreate) return resolveApiUrl(fromCreate);
  throw new Error("completed 任务缺少 audio_url");
}
