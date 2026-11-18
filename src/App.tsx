import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  createPlayback,
  pickAudioUrl,
  searchTracks,
  waitForPlaybackCompleted,
} from "./api/client";
import {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  getSavedPlatform,
  setApiBaseUrl,
  setSavedPlatform,
} from "./api/config";
import {
  DEFAULT_PLATFORM,
  type PlaybackStatus,
  type Platform,
  type SearchItem,
} from "./api/types";
import { downloadAudioForPlayback } from "./cache/download";
import type { CachePaths } from "./cache/paths";
import { ApiBaseUrlField } from "./components/ApiBaseUrlField";
import { PlayerBar } from "./components/PlayerBar";
import { SearchBar } from "./components/SearchBar";
import { SearchResults } from "./components/SearchResults";
import "./App.css";

type JobPhase =
  | "idle"
  | "creating"
  | "polling"
  | "downloading"
  | "ready"
  | "error";

function App() {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<string>(() =>
    getSavedPlatform(DEFAULT_PLATFORM),
  );
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("就绪 — 搜索后点击结果即可缓存播放");
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

  useEffect(() => {
    void (async () => {
      try {
        const paths = await invoke<CachePaths>("ensure_cache_dirs");
        setCachePaths(paths);
      } catch {
        // Browser-only / vite preview: cache commands unavailable.
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

  async function handleSelect(item: SearchItem) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setSelected(item);
    setPlayUrl(null);
    setTaskStatus(null);
    setPhase("creating");
    setNowTitle(item.song);
    setNowArtist(`${item.singer} · ${item.platform}`);
    setStatus(`创建播放任务：${item.song}`);

    try {
      const created = await createPlayback({
        platform: item.platform,
        query: `${item.song} ${item.singer}`.trim() || item.id,
        selected_id: item.id,
        quality: "high",
        include_cover: true,
      });

      if (requestId !== requestIdRef.current) return;

      setTaskStatus(created.playback.status);
      setPhase("polling");
      setStatus(`任务 ${created.playback.status}：${item.song}`);

      const completed =
        created.playback.status === "completed"
          ? created.playback
          : await waitForPlaybackCompleted(created.status_url, {
              signal: controller.signal,
              onUpdate: (task) => {
                if (requestId !== requestIdRef.current) return;
                setTaskStatus(task.status);
                setStatus(`任务 ${task.status}：${task.title || item.song}`);
                if (task.title) setNowTitle(task.title);
                if (task.artist) {
                  setNowArtist(`${task.artist} · ${item.platform}`);
                }
              },
            });

      if (requestId !== requestIdRef.current) return;

      setTaskStatus("completed");
      setPhase("downloading");
      setStatus(`下载音频中：${completed.title || item.song}`);

      const audioUrl = pickAudioUrl(completed, created);
      const downloaded = await downloadAudioForPlayback({
        audioUrl,
        fileStem: completed.id || `${item.platform}-${item.id}`,
        formatHint: completed.format,
      });

      if (requestId !== requestIdRef.current) return;

      setPlayUrl(downloaded.playUrl);
      setPhase("ready");
      setStatus(
        downloaded.reused
          ? `已命中本地缓存：${downloaded.path}`
          : `已缓存并播放：${downloaded.path}`,
      );
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

  const busy = phase === "creating" || phase === "polling" || phase === "downloading";

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
          emptyHint="输入关键词搜索，点击结果即可创建任务、下载并播放。"
          onSelect={(item) => void handleSelect(item)}
        />
        {busy && selected && (
          <p className="busy-hint">正在处理「{selected.song}」… 可点其他结果切换。</p>
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
