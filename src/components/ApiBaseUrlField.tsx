interface ApiBaseUrlFieldProps {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}

export function ApiBaseUrlField({
  value,
  onChange,
  onReset,
}: ApiBaseUrlFieldProps) {
  return (
    <label className="api-base">
      <span>API Base URL</span>
      <div className="api-base-row">
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          spellCheck={false}
          aria-label="API Base URL"
        />
        <button type="button" onClick={onReset}>
          重置
        </button>
      </div>
    </label>
  );
}
