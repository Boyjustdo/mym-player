import { DEFAULT_QUALITY, type AudioQuality } from "./types";

const STORAGE_KEY = "mym-player.apiBaseUrl";
const PLATFORM_KEY = "mym-player.platform";
const QUALITY_KEY = "mym-player.quality";

/** Default API base (anonymous, no API key). */
export const DEFAULT_API_BASE_URL = "https://music.op.wiki";

/**
 * Completed media may be served from music.zr.wiki.
 * Clients should follow absolute URLs returned by the API as-is.
 */
export const MEDIA_HOST_HINT = "music.zr.wiki";

const QUALITY_SET = new Set<string>([
  "standard",
  "high",
  "lossless",
  "hires",
]);

export function getApiBaseUrl(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url: string): void {
  const normalized = url.trim().replace(/\/+$/, "");
  localStorage.setItem(STORAGE_KEY, normalized || DEFAULT_API_BASE_URL);
}

export function getSavedPlatform(fallback: string): string {
  return localStorage.getItem(PLATFORM_KEY)?.trim() || fallback;
}

export function setSavedPlatform(platform: string): void {
  localStorage.setItem(PLATFORM_KEY, platform);
}

export function getSavedQuality(
  fallback: AudioQuality = DEFAULT_QUALITY,
): AudioQuality {
  const saved = localStorage.getItem(QUALITY_KEY)?.trim();
  if (saved && QUALITY_SET.has(saved)) {
    return saved as AudioQuality;
  }
  return fallback;
}

export function setSavedQuality(quality: AudioQuality): void {
  localStorage.setItem(QUALITY_KEY, quality);
}
