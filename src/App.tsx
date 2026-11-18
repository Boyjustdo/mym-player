import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  cacheFileStem,
  createPlayback,
  pickAudioUrl,
  searchTracks,
  waitForPlaybackCompleted,
  waitForPlaybackPlayable,
} from "./api/client";
import {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  getSavedPlatform,
  getSavedQuality,
  setApiBaseUrl,
  setSavedPlatform,
  setSavedQuality,
} from "./api/config";
import {
  DEFAULT_PLATFORM,
  type AudioQuality,
  type PlaybackStatus,
  type Platform,
  type SearchItem,
} from "./api/types";
import {
  cacheAudioInBackground,
  lookupCachedAudio,
} from "./cache/download";
import type { CachePaths } from "./cache/paths";
import { ApiBaseUrlField } from "./components/ApiBaseUrlField";
import { PlayerBar } from "./components/PlayerBar";
import { QualitySelect } from "./components/QualitySelect";
import { SearchBar } from "./components/SearchBar";
import { SearchResults } from "./components/SearchResults";
import "./App.css";

type JobPhase =
  | "idle"
  | "creating"
  | "polling"
  | "playing"
  | "caching"
  | "ready"
  | "error";

function App() {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<string>(() =>
    getSavedPlatform(DEFAULT_PLATFORM),
  );
  const [quality, setQuality] = useState<AudioQuality>(() => getSavedQuality());
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState(
    "就绪 — 可选音质；点结果即可边听边缓存",
  );
  const [apiBase, setApiBase] = useState(getApiBaseUrl());
  const [cachePaths, setCachePaths] = useState<CachePaths | null>(null);
  const [selected, setSelected] = useState<SearchItem | null>(null);
  const [taskStatus, setTaskStatus] = useState<PlaybackStatus | null>(null);
  const [phase, setPhase] = useState<JobPhase>("idle");
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [nowTitle, setNowTitle] = useState<string | undefined>();
  const [nowArtist, setNowArtist] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const qualityRef = useRef(quality);
  const selectedRef = useRef<SearchItem | null>(null);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    void (async () => {
      try {
        const paths = await invoke<CachePaths>("ensure_cache_dirs");
        setCachePaths(paths);
      } catch {
        setCachePaths(null);
      }
    })();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function persistApiBase(url: string) {
    setApiBase(url);
    setApiBaseUrl(url);
  }

  function persistPlatform(next: string) {
    setPlatform(next);
    setSavedPlatform(next);
  }

  function persistQuality(next: AudioQuality) {
    setQuality(next);
    setSavedQuality(next);
    const item = selectedRef.current;
    if (item) {
      void startPlayback(item, next);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setStatus(`搜索中（${platform}）…`);
    try {
      const items = await searchTracks({ q, platform, limit: 20 });
      setResults(items);
      setStatus(items.length === 0 ? "无结果" : `找到 ${items.length} 条`);
    } catch (err) {
      setStatus(`搜索失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSearching(false);
    }
  }

  async function startPlayback(item: SearchItem, selectedQuality: AudioQuality) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setSelected(item);
    setPlayUrl(null);
    setTaskStatus(null);
    setPhase("creating");
    setNowTitle(item.song);
    setNowArtist(`${item.singer} · ${item.platform} · ${selectedQuality}`);
    setStatus(`创建播放任务（${selectedQuality}）：${item.song}`);

    try {
      const provisionalStem = cacheFileStem({
        platform: item.platform,
        trackId: item.id,
        quality: selectedQuality,
      });
      const cachedEarly = await lookupCachedAudio(provisionalStem);
      if (cachedEarly && requestId === requestIdRef.current) {
        // Still create/reuse task for metadata, but we can start from cache after id known.
      }

      const created = await createPlayback({
        platform: item.platform,
        query: `${item.song} ${item.singer}`.trim() || item.id,
        selected_id: item.id,
        quality: selectedQuality,
        include_cover: true,
      });

      if (requestId !== requestIdRef.current) return;

      setTaskStatus(created.playback.status);
      setPhase("polling");
      setStatus(`任务 ${created.playback.status}（${selectedQuality}）：${item.song}`);

      const stem = cacheFileStem({
        playbackId: created.playback.id,
        platform: item.platform,
        trackId: item.id,
        quality: selectedQuality,
      });

      const cached = (await lookupCachedAudio(stem)) ?? cachedEarly;
      if (cached && requestId === requestIdRef.current) {
        setPlayUrl(cached.playUrl);
        setPhase("ready");
        setTaskStatus(created.playback.status);
        setStatus(`本地缓存命中（${selectedQuality}）：${cached.path}`);
        if (created.playback.status === "completed") {
          return;
        }
        // Cache hit but task may still be warming; keep listening while optional poll finishes.
      }

      const playable =
        (created.playback.status === "streaming" ||
          created.playback.status === "completed") &&
        (created.playback.audio_url || created.audio_url)
          ? created.playback
          : await waitForPlaybackPlayable(created.status_url, {
              signal: controller.signal,
              createResponse: created,
              onUpdate: (task) => {
                if (requestId !== requestIdRef.current) return;
                setTaskStatus(task.status);
                setStatus(
                  `任务 ${task.status}（${selectedQuality}）：${task.title || item.song}`,
                );
                if (task.title) setNowTitle(task.title);
                if (task.artist) {
                  setNowArtist(
                    `${task.artist} · ${item.platform} · ${selectedQuality}`,
                  );
                }
              },
            });

      if (requestId !== requestIdRef.current) return;

      setTaskStatus(playable.status);
      if (playable.title) setNowTitle(playable.title);
      if (playable.artist) {
        setNowArtist(
          `${playable.artist} · ${item.platform} · ${selectedQuality}`,
        );
      }

      const finalStem = cacheFileStem({
        playbackId: playable.id || created.playback.id,
        platform: item.platform,
        trackId: item.id,
        quality: selectedQuality,
      });

      if (!cached) {
        const remoteUrl = pickAudioUrl(playable, created);
        setPlayUrl(remoteUrl);
        setPhase("playing");
        setStatus(
          playable.status === "completed"
            ? `在线播放中，后台缓存（${selectedQuality}）…`
            : `边生成边听（${playable.status} / ${selectedQuality}）…`,
        );
      }

      let completed = playable;
      if (playable.status !== "completed") {
        completed = await waitForPlaybackCompleted(created.status_url, {
          signal: controller.signal,
          onUpdate: (task) => {
            if (requestId !== requestIdRef.current) return;
            setTaskStatus(task.status);
            setStatus(
              `任务 ${task.status}（${selectedQuality}）：${task.title || item.song}`,
            );
          },
        });
      }

      if (requestId !== requestIdRef.current) return;

      setTaskStatus("completed");
      const audioUrl = pickAudioUrl(completed, created);

      if (cached) {
        setPhase("ready");
        setStatus(`本地缓存播放（${selectedQuality}）：${cached.path}`);
        return;
      }

      setPhase("caching");
      setStatus(`后台写入缓存（${selectedQuality}）…`);

      // Keep remote playUrl while caching; switch to local when done.
      void (async () => {
        try {
          const downloaded = await cacheAudioInBackground({
            audioUrl,
            fileStem: finalStem,
            formatHint: completed.format,
          });
          if (requestId !== requestIdRef.current) return;
          setPlayUrl(downloaded.playUrl);
          setPhase("ready");
          setStatus(
            downloaded.reused
              ? `已命中本地缓存（${selectedQuality}）：${downloaded.path}`
              : `已缓存（${selectedQuality}）：${downloaded.path}`,
          );
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          // Online play can continue even if cache write fails.
          setPhase("playing");
          setStatus(
            `在线播放中；缓存失败: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      })();
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setPhase("error");
      setTaskStatus("failed");
      setStatus(`失败: ${message}`);
    }
  }

  async function openCacheDir() {
    try {
      await invoke("open_cache_dir");
      setStatus("已请求打开本地缓存目录");
    } catch (err) {
      setStatus(
        `打开缓存目录失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const busy =
    phase === "creating" ||
    phase === "polling" ||
    phase === "caching" ||
    phase === "playing";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>mym-player</h1>
          <p className="subtitle">本地缓存播放 · Tauri 2 + React + TS</p>
        </div>
        <button type="button" className="ghost" onClick={() => void openCacheDir()}>
          打开缓存目录
        </button>
      </header>

      <section className="panel settings" aria-label="设置">
        <ApiBaseUrlField
          value={apiBase}
          onChange={persistApiBase}
          onReset={() => persistApiBase(DEFAULT_API_BASE_URL)}
        />
        <QualitySelect value={quality} onChange={persistQuality} />
        {cachePaths && (
          <p className="cache-hint" title={cachePaths.cacheRoot}>
            缓存根目录：{cachePaths.cacheRoot}
          </p>
        )}
      </section>

      <section className="panel search" aria-label="搜索">
        <SearchBar
          value={query}
          platform={platform as Platform}
          onChange={setQuery}
          onPlatformChange={persistPlatform}
          onSearch={() => void handleSearch()}
          disabled={searching}
        />
        <p className={`status ${phase === "error" ? "status-error" : ""}`} role="status">
          {status}
        </p>
        <SearchResults
          items={results}
          emptyHint="输入关键词搜索，点击结果即可边听边缓存。切换音质会重建任务。"
          onSelect={(item) => void startPlayback(item, qualityRef.current)}
        />
        {busy && selected && (
          <p className="busy-hint">
            正在处理「{selected.song}」[{quality}]… 可点其他结果或改音质切换。
          </p>
        )}
      </section>

      <PlayerBar
        title={nowTitle}
        artist={nowArtist}
        src={playUrl}
        taskStatus={taskStatus}
      />
    </div>
  );
}

export default App;
