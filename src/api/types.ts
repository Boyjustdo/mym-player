/**
 * Types aligned with 音乐播放 API OpenAPI v1.3.0.
 */

export type Platform =
  | "applemusic"
  | "bilibili"
  | "kugou"
  | "netease"
  | "soda"
  | "tencent"
  | "youtubemusic";

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "tencent", label: "QQ 音乐" },
  { id: "netease", label: "网易云" },
  { id: "kugou", label: "酷狗" },
  { id: "applemusic", label: "Apple Music" },
  { id: "bilibili", label: "Bilibili" },
  { id: "soda", label: "Soda" },
  { id: "youtubemusic", label: "YouTube Music" },
];

/** Default search/create platform (OpenAPI examples use tencent). */
export const DEFAULT_PLATFORM: Platform = "tencent";

/** OpenAPI suggested quality values (not a strict enum server-side). */
export type AudioQuality = "standard" | "high" | "lossless" | "hires";

export const AUDIO_QUALITIES: { id: AudioQuality; label: string }[] = [
  { id: "standard", label: "标准" },
  { id: "high", label: "较高" },
  { id: "lossless", label: "无损" },
  { id: "hires", label: "Hi-Res" },
];

export const DEFAULT_QUALITY: AudioQuality = "high";

export type PlaybackStatus =
  | "queued"
  | "processing"
  | "streaming"
  | "completed"
  | "failed";

export interface SearchItem {
  platform: Platform;
  id: string;
  song: string;
  singer: string;
  cover: string;
}

export interface CreatePlaybackRequest {
  platform: Platform | string;
  query: string;
  selected_id?: string | null;
  quality?: string | null;
  include_cover?: boolean;
  // Omit streaming_mode for standard local download path
}

export interface CreatePlaybackResponse {
  playback: PlaybackTask;
  status_url: string;
  audio_url: string;
  cover_url: string;
  lyrics_url: string;
}

export interface PlaybackTask {
  id: string;
  status: PlaybackStatus;
  platform?: string;
  query?: string;
  selected_id?: string | null;
  quality?: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  content_type?: string | null;
  format?: string | null;
  error?: string | null;
  audio_url?: string;
  cover_url?: string;
  lyrics_url?: string;
  media_revision?: string;
  duration?: number | null;
}

export interface PlatformInfo {
  id: string;
  label: string;
  aliases?: string[];
}

export interface ErrorResponse {
  detail: string;
}
