import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface RangeSwitcherProps {
  label: string;
  isCurrent: boolean;
  currentLabel: string;
  resetLabel: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
  allowFuture?: boolean;
}

export function RangeSwitcher({
  label,
  isCurrent,
  currentLabel,
  resetLabel,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onReset,
  allowFuture = false,
}: RangeSwitcherProps) {
  return (
    <div className="month-switcher">
      <button type="button" className="month-nav" onClick={onPrevious} aria-label={previousLabel}>
        <ChevronLeftIcon size={19} />
      </button>
      <div className="month-switcher-label">
        <strong>{label}</strong>
        {isCurrent ? (
          <span className="month-current">{currentLabel}</span>
        ) : (
          <button type="button" className="month-reset" onClick={onReset}>
            {resetLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        className="month-nav"
        onClick={onNext}
        aria-label={nextLabel}
        disabled={isCurrent && !allowFuture}
      >
        <ChevronRightIcon size={19} />
      </button>
    </div>
  );
}
