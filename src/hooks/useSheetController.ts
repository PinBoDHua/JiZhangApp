import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfirmState, SheetState } from '../app/sheetState';
import { prefersReducedMotion } from '../motion';

/** 浮层退场动画时长，与 index.css 中的 .sheet.is-closing 保持一致 */
export const SHEET_EXIT_MS = 220;

export interface SheetController {
  sheet: SheetState | null;
  /** 退场动画进行中：业务浮层据此隐藏交互并播放关闭效果 */
  closing: boolean;
  openSheet: (sheet: SheetState) => void;
  closeSheet: () => void;
  confirm: ConfirmState | null;
  askConfirm: (state: ConfirmState) => void;
  closeConfirm: () => void;
}

/**
 * 浮层与确认框的开关状态机。
 *
 * 规则：
 * - 关闭时先播 220ms 退场再卸载；减少动态效果时立即卸载；
 * - 退场期间打开新浮层会取消上一次卸载，避免新浮层被误关；
 * - 确认框独立于浮层，浮层可以保持打开（例如「删除排班」确认）。
 */
export function useSheetController(): SheetController {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelPendingClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setClosing(false);
  }, []);

  const openSheet = useCallback(
    (next: SheetState) => {
      cancelPendingClose();
      setSheet(next);
    },
    [cancelPendingClose],
  );

  const closeSheet = useCallback(() => {
    if (!sheet || closeTimerRef.current !== null) return;
    if (prefersReducedMotion()) {
      setSheet(null);
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setSheet(null);
      setClosing(false);
    }, SHEET_EXIT_MS);
  }, [sheet]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const askConfirm = useCallback((state: ConfirmState) => setConfirm(state), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);

  return { sheet, closing, openSheet, closeSheet, confirm, askConfirm, closeConfirm };
}
