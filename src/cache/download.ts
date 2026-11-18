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

function sanitizeStem(stem: string): string {
  return stem.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "track";
}

/**
 * Download completed audio into the local cache directory and return a playable URL.
 * In Tauri: Rust writes the file; play via asset protocol (convertFileSrc).
 * In browser-only vite: blob object URL fallback (not persisted).
 */
export async function downloadAudioForPlayback(args: {
  audioUrl: string;
  fileStem: string;
  formatHint?: string | null;
}): Promise<DownloadResult> {
  const url = resolveApiUrl(args.audioUrl);

  if (isTauriRuntime()) {
    const result = await invoke<{ path: string; reused: boolean }>(
      "download_audio",
      {
        url,
        fileStem: sanitizeStem(args.fileStem),
        formatHint: args.formatHint ?? null,
      },
    );
    return {
      path: result.path,
      playUrl: convertFileSrc(result.path),
      reused: result.reused,
    };
  }

  const res = await fetch(url, { headers: { Accept: "*/*" } });
  if (!res.ok) {
    throw new Error(`下载失败 HTTP ${res.status}`);
  }
  const blob = await res.blob();
  return {
    path: "(memory)",
    playUrl: URL.createObjectURL(blob),
    reused: false,
  };
}
