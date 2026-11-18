import { useEffect, useRef, useState } from "react";

interface PlayerBarProps {
  title?: string;
  artist?: string;
  src?: string | null;
  taskStatus?: string | null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerBar({ title, artist, src, taskStatus }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    setCurrent(0);
    setDuration(0);
    setPlaying(false);
    if (!src) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    audio.src = src;
    void audio
      .play()
      .then(() => setPlaying(true))
      .catch((err: unknown) => {
        setPlaying(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        });
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  return (
    <footer className="player-bar" aria-label="播放条">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
        onError={() => setError("音频播放失败")}
      />
      <div className="now-playing">
        <span className="now-title">{title ?? "未在播放"}</span>
        <span className="now-artist">
          {artist ?? "—"}
          {taskStatus ? ` · ${taskStatus}` : ""}
        </span>
        {error && <span className="now-error">{error}</span>}
      </div>
      <div className="transport">
        <button type="button" onClick={togglePlay} disabled={!src}>
          {playing ? "⏸" : "▶"}
        </button>
      </div>
      <div className="progress" aria-hidden={!src}>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="time">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      </div>
    </footer>
  );
}
