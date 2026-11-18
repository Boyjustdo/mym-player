import { getApiBaseUrl } from "./config";
import type {
  CreatePlaybackRequest,
  CreatePlaybackResponse,
  PlatformInfo,
  PlaybackTask,
  SearchItem,
} from "./types";

function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Thin fetch helper. Do not forge browser headers (sec-ch-ua, Referer, etc.).
 * Do not forward Cookie / Authorization — API is anonymous.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

/** GET /api/v1/platforms */
export async function listPlatforms(): Promise<PlatformInfo[]> {
  // TODO: wire response shape once UI needs platform picker
  return requestJson<PlatformInfo[]>("/api/v1/platforms");
}

/**
 * GET /api/v1/search?platform&q&limit
 * Skeleton: returns empty list until search is implemented against live API.
 */
export async function searchTracks(params: {
  q: string;
  platform?: string;
  limit?: number;
}): Promise<SearchItem[]> {
  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.platform) query.set("platform", params.platform);
  if (params.limit != null) query.set("limit", String(params.limit));

  // TODO: call live API and normalize SearchResponse → SearchItem[]
  // const data = await requestJson<SearchResponse>(`/api/v1/search?${query}`);
  // return data.results ?? data.items ?? [];
  console.info("[api] searchTracks stub", { ...params, url: apiUrl(`/api/v1/search?${query}`) });
  return [];
}

/**
 * POST /api/v1/playbacks — omit streaming_mode for standard download path.
 * TODO: implement create + poll status_url until completed + download audio_url.
 */
export async function createPlayback(
  body: CreatePlaybackRequest,
): Promise<CreatePlaybackResponse> {
  // TODO:
  // 1. POST /api/v1/playbacks (omit streaming_mode)
  // 2. If 202, poll status_url (~1s, backoff) until completed | failed
  // 3. On completed, GET audio_url (keep rev query) and save to local cache
  // 4. Do not use repeated POST instead of polling; do not treat streaming as done
  void body;
  throw new Error("createPlayback not implemented (skeleton stub)");
}

/** GET status_url / /api/v1/playbacks/{id} */
export async function getPlaybackStatus(_statusUrl: string): Promise<PlaybackTask> {
  // TODO: poll until completed | failed; stop on failed
  throw new Error("getPlaybackStatus not implemented (skeleton stub)");
}

/**
 * Download completed audio to local cache.
 * Media host may be music.zr.wiki — follow the absolute URL from the API.
 */
export async function downloadAudioToCache(_args: {
  audioUrl: string;
  destPath: string;
}): Promise<void> {
  // TODO: GET audio_url with Range support; persist by Content-Type / disposition
  // Do not hardcode .mp3 / .m4a extensions
  throw new Error("downloadAudioToCache not implemented (skeleton stub)");
}
