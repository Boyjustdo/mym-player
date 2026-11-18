import type { SearchItem } from "../api/types";

interface SearchResultsProps {
  items: SearchItem[];
  emptyHint: string;
  onSelect?: (item: SearchItem) => void;
}

export function SearchResults({
  items,
  emptyHint,
  onSelect,
}: SearchResultsProps) {
  if (items.length === 0) {
    return (
      <div className="search-results empty" role="status">
        <p>{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="search-results" aria-label="搜索结果">
      {items.map((item) => (
        <li key={`${item.platform}:${item.id}`}>
          <button
            type="button"
            className="result-row"
            onClick={() => onSelect?.(item)}
          >
            <span className="result-title">{item.song}</span>
            <span className="result-meta">
              {item.singer} · {item.platform}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
