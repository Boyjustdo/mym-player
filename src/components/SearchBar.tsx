interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  disabled?: boolean;
}

export function SearchBar({
  value,
  onChange,
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
