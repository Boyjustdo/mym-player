/**
 * Types aligned with 音乐播放 API OpenAPI v1.3.0 (placeholders).
 * Full schema: project store internal/openapi.json
 */

export type Platform =
  | "applemusic"
  | "bilibili"
  | "kugou"
  | "netease"
  | "soda"
  | "tencent"
  | "youtubemusic";

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
  album?: string;
  duration?: number;
}

export interface SearchResponse {
  // TODO: confirm exact response envelope from OpenAPI
  items?: SearchItem[];
  results?: SearchItem[];
}

export interface CreatePlaybackRequest {
  platform: Platform | string;
  query: string;
  selected_id?: string;
  quality?: string;
  // Omit streaming_mode for standard local download path
  include_cover?: boolean;
}

export interface CreatePlaybackResponse {
  playback?: PlaybackTask;
  status_url?: string;
  audio_url?: string;
  cover_url?: string;
  lyrics_url?: string;
}

export interface PlaybackTask {
  id?: string;
  status?: PlaybackStatus;
  error?: string;
  // TODO: fill remaining fields when implementing poll/download
}

export interface PlatformInfo {
  id?: string;
  name?: string;
  aliases?: string[];
}
