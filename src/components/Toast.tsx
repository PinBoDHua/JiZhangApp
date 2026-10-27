import { useState, type CSSProperties } from 'react';
import { CheckIcon } from './Icons';

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  leaving?: boolean;
  duration?: number;
  /** 浮层退场期间先把 Toast 藏住，等浮层落下再出现，避免两个层叠在一起 */
  enterDelay?: number;
}

export function Toast({
  message,
  actionLabel,
  onAction,
  leaving = false,
  duration = 2600,
  enterDelay = 0,
}: ToastProps) {
  // 只在挂载时取一次：已经显示的 Toast 不应因为浮层开始关闭而重新播放入场
  const [delay] = useState(enterDelay);
  const lifeDuration = Math.max(600, duration - delay);

  return (
    <div
      className={`toast${actionLabel ? ' has-action' : ''}${leaving ? ' is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      style={
        {
          '--toast-life': `${lifeDuration}ms`,
          '--toast-delay': `${delay}ms`,
        } as CSSProperties
      }
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
      <span className="toast-life" aria-hidden="true" />
    </div>
  );
}
