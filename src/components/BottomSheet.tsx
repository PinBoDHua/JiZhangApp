import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

interface BottomSheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  escapeDisabled?: boolean;
}

export function BottomSheet({
  title,
  subtitle,
  onClose,
  action,
  children,
  footer,
  escapeDisabled = false,
}: BottomSheetProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !escapeDisabled) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, escapeDisabled]);

  return (
    <div className="sheet-backdrop">
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-header">
          <button type="button" className="icon-button sheet-close" onClick={onClose} aria-label="关闭">
            <CloseIcon size={20} />
          </button>
          <div className="sheet-heading">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="sheet-action">{action}</div>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
