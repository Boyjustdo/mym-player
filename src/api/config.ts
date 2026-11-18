const STORAGE_KEY = "mym-player.apiBaseUrl";
const PLATFORM_KEY = "mym-player.platform";

/** Default API base (anonymous, no API key). */
export const DEFAULT_API_BASE_URL = "https://music.op.wiki";

/**
 * Completed media may be served from music.zr.wiki.
 * Clients should follow absolute URLs returned by the API as-is.
 */
export const MEDIA_HOST_HINT = "music.zr.wiki";

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
