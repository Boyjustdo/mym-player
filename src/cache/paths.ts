/**
 * Local cache layout (per device, under app data dir):
 *
 *   {appData}/cache/audio/    — completed media files
 *   {appData}/cache/covers/   — cover images
 *   {appData}/cache/lyrics/   — lyrics payloads
 *
 * Absolute app data path comes from Rust command `get_app_data_dir`
 * / `ensure_cache_dirs`.
 */

export const CACHE_RELATIVE = {
  root: "cache",
  audio: "cache/audio",
  covers: "cache/covers",
  lyrics: "cache/lyrics",
} as const;

export interface CachePaths {
  appDataDir: string;
  cacheRoot: string;
  audioDir: string;
  coversDir: string;
  lyricsDir: string;
}
