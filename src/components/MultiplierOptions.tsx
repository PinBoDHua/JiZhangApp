interface MultiplierOptionsProps {
  value: number;
  onChange: (value: number) => void;
  /** 只展示不低于该值的倍数，用于排除「加班 1×」 */
  min?: number;
  label?: string;
}

const MULTIPLIERS = [1, 1.25, 1.5, 1.75, 2, 3];

export function MultiplierOptions({
  value,
  onChange,
  min,
  label = '选择计薪倍数',
}: MultiplierOptionsProps) {
  const options =
    min === undefined ? MULTIPLIERS : MULTIPLIERS.filter((multiplier) => multiplier >= min);

  return (
    <div className="chip-row multiplier-row" role="group" aria-label={label}>
      {options.map((multiplier) => (
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
