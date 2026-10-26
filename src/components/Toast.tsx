import { CheckIcon } from './Icons';

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({ message, actionLabel, onAction }: ToastProps) {
  return (
    <div
      className={`toast${actionLabel ? ' has-action' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast-icon">
        <CheckIcon size={14} />
      </span>
      <span className="toast-message">{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="toast-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
