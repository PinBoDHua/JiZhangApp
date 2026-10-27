import { prefersReducedMotion } from './motion';

type VibratePattern = number | number[];

function vibrate(pattern: VibratePattern): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 部分浏览器/WebView 禁用振动，不影响任何交互
  }
}

/** 切换标签、翻月等轻量操作：很短的一下，只做“收到了”的确认。 */
export function hapticTap(): void {
  vibrate(10);
}

/** 保存、结束打卡等完成动作：两段式轻反馈，比单次长振动更克制。 */
export function hapticSuccess(): void {
  vibrate([12, 28, 14]);
}

/** 删除、撤销、关闭等边界动作：略重一点，帮助确认状态已改变。 */
export function hapticImpact(): void {
  vibrate(18);
}
