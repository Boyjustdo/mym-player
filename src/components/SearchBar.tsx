import { PLATFORMS, type Platform } from "../api/types";

interface SearchBarProps {
  value: string;
  platform: Platform | string;
  onChange: (value: string) => void;
  onPlatformChange: (platform: string) => void;
  onSearch: () => void;
  disabled?: boolean;
}

export function SearchBar({
  value,
  platform,
  onChange,
  onPlatformChange,
  onSearch,
  disabled,
}: SearchBarProps) {
  return (
    <form
      className="search-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <select
        value={platform}
        onChange={(e) => onPlatformChange(e.currentTarget.value)}
        aria-label="平台"
        disabled={disabled}
      >
        {PLATFORMS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder="搜索歌曲…"
        aria-label="搜索歌曲"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        搜索
      </button>
    </form>
  );
}
