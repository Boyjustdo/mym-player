interface PlayerBarProps {
  title?: string;
  artist?: string;
}

/** Playback controls placeholder — no decode / transport yet. */
export function PlayerBar({ title, artist }: PlayerBarProps) {
  return (
    <footer className="player-bar" aria-label="播放条占位">
      <div className="now-playing">
        <span className="now-title">{title ?? "未在播放"}</span>
        <span className="now-artist">{artist ?? "—"}</span>
      </div>
      <div className="transport" aria-disabled="true">
        <button type="button" disabled title="TODO: 上一首">
          ⏮
        </button>
        <button type="button" disabled title="TODO: 播放/暂停">
          ▶
        </button>
        <button type="button" disabled title="TODO: 下一首">
          ⏭
        </button>
      </div>
      <div className="progress" aria-hidden="true">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: "0%" }} />
        </div>
        <span className="time">0:00 / 0:00</span>
      </div>
    </footer>
  );
}
