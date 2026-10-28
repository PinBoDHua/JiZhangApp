import type { ReactNode } from 'react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { formatMoney } from '../utils';

interface AnimatedValueProps {
  value: number;
  /** 数据范围（月份、周期）：变化时直接切到新值，不播放滚动 */
  resetKey?: string;
  duration?: number;
  /** 显示格式，默认按金额格式化 */
  format?: (value: number) => ReactNode;
}

/**
 * 金额 / 百分比滚动数字（2.4）。
 *
 * 之前把 useAnimatedNumber 放在页面组件里，620ms 的动画每帧都会让整页重渲染：
 * 首页会重算本周概览，统计页会重算收入预测与排班对账。把动画状态收进这个小
 * 组件后，每帧只重渲染这一个文本节点，页面其余部分不再跟着动。
 */
export function AnimatedValue({
  value,
  resetKey = '',
  duration,
  format = formatMoney,
}: AnimatedValueProps) {
  const shown = useAnimatedNumber(value, { resetKey, duration });
  return <>{format(shown)}</>;
}
