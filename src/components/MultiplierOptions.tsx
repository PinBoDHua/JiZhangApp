interface MultiplierOptionsProps {
  value: number;
  onChange: (value: number) => void;
}

const MULTIPLIERS = [1, 1.25, 1.5, 1.75, 2, 3];

export function MultiplierOptions({ value, onChange }: MultiplierOptionsProps) {
  return (
    <div className="chip-row multiplier-row" role="group" aria-label="选择计薪倍数">
      {MULTIPLIERS.map((multiplier) => (
        <button
          key={multiplier}
          type="button"
          className={`choice-chip${value === multiplier ? ' is-active' : ''}`}
          onClick={() => onChange(multiplier)}
          aria-pressed={value === multiplier}
        >
          {multiplier}×
        </button>
      ))}
    </div>
  );
}
