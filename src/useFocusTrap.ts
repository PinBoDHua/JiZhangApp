import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 只有最上层的浮层处理 Tab，避免弹窗叠在面板上时互相抢焦点。 */
const trapStack: symbol[] = [];

function visibleFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.getClientRects().length > 0,
  );
}

/**
 * 打开浮层时把焦点移入面板，Tab / Shift+Tab 在面板内循环，关闭后归还焦点。
 */
export function useFocusTrap<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const token = Symbol('focus-trap');
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    trapStack.push(token);
    // 焦点落在面板本身而不是第一个控件上，避免回车误触“关闭”或“确认”
    container.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      if (trapStack[trapStack.length - 1] !== token) return;
      const nodes = visibleFocusable(container);
      if (nodes.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside =
        active instanceof Node && active !== container && container.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }
      if (!inside || active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = trapStack.indexOf(token);
      if (index >= 0) trapStack.splice(index, 1);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  return containerRef;
}
