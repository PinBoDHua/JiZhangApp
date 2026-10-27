import { useRef, useState } from 'react';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';
import { prefersReducedMotion } from '../motion';

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3;

interface AnimatedNumberOptions {
  duration?: number;
  /**
   * 数据范围标识（月份、周期、年份）。变化时直接切到新值，
   * 避免翻月后把上个月的金额滚成新月份的数字。
   */
  resetKey?: string;
}

/**
 * 金额滚动：同一数据范围内数值变化时从当前显示值缓动到新值。
 * 首次挂载与切换范围都不播放，避免每次进入页面都从 0 重数。
 */
export function useAnimatedNumber(
  value: number,
  { duration = 620, resetKey = '' }: AnimatedNumberOptions = {},
): number {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(safeValue);
  const displayRef = useRef(safeValue);
  const keyRef = useRef(resetKey);
  const frameRef = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const from = displayRef.current;
    const rangeChanged = keyRef.current !== resetKey;
    keyRef.current = resetKey;

    if (
      rangeChanged ||
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== 'function' ||
      Math.abs(safeValue - from) < 0.01
    ) {
      displayRef.current = safeValue;
      setDisplay(safeValue);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = from + (safeValue - from) * easeOutCubic(progress);
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        displayRef.current = safeValue;
        setDisplay(safeValue);
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [safeValue, duration, resetKey]);

  return display;
}
