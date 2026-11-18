import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { resolveApiUrl } from "../api/url";

export interface DownloadResult {
  path: string;
  playUrl: string;
  reused: boolean;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function sanitizeStem(stem: string): string {
  return stem.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "track";
}

/** Look up an existing quality-specific cache file without downloading. */
export async function lookupCachedAudio(
  fileStem: string,
): Promise<DownloadResult | null> {
  const stem = sanitizeStem(fileStem);
  if (!isTauriRuntime()) return null;
  try {
    const path = await invoke<string | null>("lookup_cached_audio", {
      fileStem: stem,
    });
    if (!path) return null;
    return { path, playUrl: convertFileSrc(path), reused: true };
  } catch {
    return null;
  }
}

/**
 * Cache completed audio in the background (does not block playback).
 * Cache keys must include quality (via playback id / fileStem).
 */
export async function cacheAudioInBackground(args: {
  audioUrl: string;
  fileStem: string;
  formatHint?: string | null;
}): Promise<DownloadResult> {
  const url = resolveApiUrl(args.audioUrl);
  const stem = sanitizeStem(args.fileStem);

  if (isTauriRuntime()) {
    const result = await invoke<{ path: string; reused: boolean }>(
      "download_audio",
      {
        url,
        fileStem: stem,
        formatHint: args.formatHint ?? null,
      },
    );
    return {
      path: result.path,
      playUrl: convertFileSrc(result.path),
      reused: result.reused,
    };
  }

  // Browser-only: no durable cache; caller already plays the remote URL.
  return { path: "(memory)", playUrl: url, reused: false };
}
