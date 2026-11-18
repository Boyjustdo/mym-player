import { AUDIO_QUALITIES, type AudioQuality } from "../api/types";

interface QualitySelectProps {
  value: AudioQuality;
  onChange: (quality: AudioQuality) => void;
  disabled?: boolean;
}

export function QualitySelect({
  value,
  onChange,
  disabled,
}: QualitySelectProps) {
  return (
    <label className="quality-select">
      <span>音质</span>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as AudioQuality)}
        aria-label="音质"
        disabled={disabled}
      >
        {AUDIO_QUALITIES.map((q) => (
          <option key={q.id} value={q.id}>
            {q.label} ({q.id})
          </option>
        ))}
      </select>
    </label>
  );
}
