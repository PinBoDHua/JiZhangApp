/**
 * 金额、时长、计数的展示格式（纯函数）。
 *
 * 从 utils.ts 拆出的第二部分。统一在这里处理「取整 → 千分位 → 正负号 → 单位」，
 * 页面里不再出现 `toFixed(2)` 或手写的 `¥` 拼接。
 */

import { round2, roundInt } from '../num';

const integerMoneyFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const decimalMoneyFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = round2(safe);
  if (rounded === 0) return integerMoneyFormat.format(0);
  return (Number.isInteger(rounded) ? integerMoneyFormat : decimalMoneyFormat).format(rounded);
}

/**
 * 差值符号统一用 ASCII 的「-」而不是排版减号「−」：
 * 工资条、年度复盘会导出成纯文本发给别人，ASCII 符号在任何字体和编辑器里都不会缺字。
 */
const MINUS_SIGN = '-';

/** +¥120 / -¥120 / ¥0：涨跌、差额一类金额 */
export function formatSignedMoney(value: number): string {
  const rounded = round2(Number.isFinite(value) ? value : 0);
  if (rounded === 0) return `¥${formatMoney(0)}`;
  return `${rounded > 0 ? '+' : MINUS_SIGN}¥${formatMoney(Math.abs(rounded))}`;
}

/** +3 / -3 / 0：班次、天数一类的计数差 */
export function formatSignedCount(value: number): string {
  const safe = roundInt(value);
  if (safe === 0) return '0';
  return `${safe > 0 ? '+' : MINUS_SIGN}${Math.abs(safe)}`;
}

/** +1 小时 30 分 / -1 小时：工时差 */
export function formatSignedDuration(minutes: number): string {
  const safe = Math.round(Number.isFinite(minutes) ? minutes : 0);
  if (safe === 0) return formatDuration(0);
  return `${safe > 0 ? '+' : MINUS_SIGN}${formatDuration(Math.abs(safe))}`;
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

export function formatElapsed(minutes: number): string {
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  return formatDuration(minutes);
}

export function formatHours(minutes: number): string {
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value}`;
}
