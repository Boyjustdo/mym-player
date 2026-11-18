import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { searchTracks } from "./api/client";
import {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  setApiBaseUrl,
} from "./api/config";
import type { SearchItem } from "./api/types";
import type { CachePaths } from "./cache/paths";
import { ApiBaseUrlField } from "./components/ApiBaseUrlField";
import { PlayerBar } from "./components/PlayerBar";
import { SearchBar } from "./components/SearchBar";
import { SearchResults } from "./components/SearchResults";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("骨架就绪 — 搜索/下载尚未实现");
  const [apiBase, setApiBase] = useState(getApiBaseUrl());
  const [cachePaths, setCachePaths] = useState<CachePaths | null>(null);
  const [selected, setSelected] = useState<SearchItem | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const paths = await invoke<CachePaths>("ensure_cache_dirs");
        setCachePaths(paths);
      } catch (err) {
        setStatus(`缓存目录初始化失败: ${String(err)}`);
      }
    })();
  }, []);

  function persistApiBase(url: string) {
    setApiBase(url);
    setApiBaseUrl(url);
  }

  async function handleSearch() {
    setSearching(true);
    setStatus("搜索中（当前为 stub，返回空列表）…");
    try {
      const items = await searchTracks({ q: query.trim(), limit: 20 });
      setResults(items);
      setStatus(
        items.length === 0
          ? "无结果（stub）。下一步：接通 GET /api/v1/search"
          : `找到 ${items.length} 条`,
      );
    } catch (err) {
      setStatus(`搜索失败: ${String(err)}`);
    } finally {
      setSearching(false);
    }
  }

  async function openCacheDir() {
    try {
      await invoke("open_cache_dir");
      setStatus("已请求打开本地缓存目录");
    } catch (err) {
      setStatus(`打开缓存目录失败: ${String(err)}`);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>mym-player</h1>
          <p className="subtitle">本地缓存播放骨架 · Tauri 2 + React + TS</p>
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
          onChange={setQuery}
          onSearch={() => void handleSearch()}
          disabled={searching}
        />
        <p className="status" role="status">
          {status}
        </p>
        <SearchResults
          items={results}
          emptyHint="搜索结果占位。实现 API client 后在此列出曲目。"
          onSelect={(item) => {
            setSelected(item);
            setStatus(
              `已选 ${item.song} — TODO: POST /api/v1/playbacks → 轮询 → 落盘`,
            );
          }}
        />
      </section>

      <PlayerBar
        title={selected?.song}
        artist={selected ? `${selected.singer} · ${selected.platform}` : undefined}
      />
    </div>
  );
}

export default App;
