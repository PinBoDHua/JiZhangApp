import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../useFocusTrap';
import { prefersReducedMotion } from '../motion';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

const EXIT_MS = 170;

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const timerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    document.documentElement.classList.add('dialog-open');
    return () => document.documentElement.classList.remove('dialog-open');
  }, []);

  const requestClose = (action: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        action();
      },
      prefersReducedMotion() ? 0 : EXIT_MS,
    );
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose(onCancel);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className={`dialog-backdrop${closing ? ' is-closing' : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose(onCancel);
      }}
    >
      <div
        ref={dialogRef}
        className={`dialog${closing ? ' is-closing' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
      >
        <h2 id="dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="ghost-button" onClick={() => requestClose(onCancel)}>
            取消
          </button>
          <button
            type="button"
            className={danger ? 'danger-button' : 'primary-button'}
            onClick={() => requestClose(onConfirm)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
