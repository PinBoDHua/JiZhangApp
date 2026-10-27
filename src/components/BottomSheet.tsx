import {
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useFocusTrap } from '../useFocusTrap';
import { hapticImpact } from '../feedback';
import { prefersReducedMotion } from '../motion';
import { SheetMotionContext } from '../sheetMotion';
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

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.5;
const EXIT_FALLBACK_MS = 220;

interface DragState {
  active: boolean;
  pointerId: number;
  startY: number;
  visual: number;
  velocity: number;
  lastAt: number;
}

/**
 * 底部浮层：共用进退场、下滑关闭、背景点击关闭和滚动锁。
 * 退场统一交给 App 的 closing 状态，业务 sheet 只负责调用 onClose。
 */
export function BottomSheet({
  title,
  subtitle,
  onClose,
  action,
  children,
  footer,
  escapeDisabled = false,
}: BottomSheetProps) {
  const sheetRef = useFocusTrap<HTMLElement>();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({
    active: false,
    pointerId: -1,
    startY: 0,
    visual: 0,
    velocity: 0,
    lastAt: 0,
  });
  const frameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closing = useContext(SheetMotionContext);
  const [dragging, setDragging] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const blocked = closing || dismissed;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !escapeDisabled && !blocked) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, escapeDisabled, blocked]);

  useEffect(() => {
    document.documentElement.classList.add('sheet-open');
    return () => document.documentElement.classList.remove('sheet-open');
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const paint = (visual: number) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transform = `translate3d(0, ${visual}px, 0)`;
    const progress = Math.min(1, Math.max(0, visual / 240));
    backdropRef.current?.style.setProperty('--dismiss-progress', String(progress));
  };

  const schedulePaint = (visual: number) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint(visual);
    });
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (blocked || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="switch"]')) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startY: event.clientY,
      visual: 0,
      velocity: 0,
      lastAt: event.timeStamp,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const raw = event.clientY - drag.startY;
    const visual =
      raw >= 0
        ? raw < 160
          ? raw
          : 160 + (raw - 160) * 0.35
        : Math.max(-14, raw * 0.3);
    const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
    drag.velocity = (visual - drag.visual) / elapsed;
    drag.visual = visual;
    drag.lastAt = event.timeStamp;
    schedulePaint(visual);
  };

  const springBack = () => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (sheet) {
      sheet.style.transition = prefersReducedMotion()
        ? 'none'
        : 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)';
      sheet.style.transform = '';
    }
    backdrop?.style.setProperty('--dismiss-progress', '0');
    settleTimerRef.current = window.setTimeout(
      () => {
        settleTimerRef.current = null;
        if (sheet) sheet.style.transition = '';
        setDragging(false);
      },
      prefersReducedMotion() ? 0 : 340,
    );
  };

  const dismissByDrag = () => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    const sheet = sheetRef.current;
    setDismissed(true);
    setDragging(false);
    if (sheet) {
      sheet.style.transition = prefersReducedMotion()
        ? 'none'
        : 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
      sheet.style.transform = 'translate3d(0, 100%, 0)';
    }
    backdropRef.current?.style.setProperty('--dismiss-progress', '1');
    hapticImpact();
    closeTimerRef.current = window.setTimeout(
      () => {
        closeTimerRef.current = null;
        onClose();
      },
      prefersReducedMotion() ? 0 : EXIT_FALLBACK_MS,
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    // 松手前停顿超过 120ms 就不再算“甩动”，只看位移
    const idle = event.timeStamp - drag.lastAt;
    const velocity = idle > 120 ? 0 : Math.max(0, drag.velocity);
    if (drag.visual > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      dismissByDrag();
    } else {
      springBack();
    }
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    springBack();
  };

  const dragHandlers = {
    onPointerDown: beginDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: cancelDrag,
  };

  return (
    <div
      ref={backdropRef}
      className={`sheet-backdrop${closing ? ' is-closing' : ''}${
        dismissed ? ' is-dismissed' : ''
      }`}
      onMouseDown={(event) => {
        if (!blocked && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={sheetRef}
        className={`sheet${closing ? ' is-closing' : ''}${
          dragging ? ' is-dragging' : ''
        }${dismissed ? ' is-dismissed' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <span className="sheet-grabber" aria-hidden="true" {...dragHandlers}>
          <i />
        </span>
        <header className="sheet-header" {...dragHandlers}>
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
