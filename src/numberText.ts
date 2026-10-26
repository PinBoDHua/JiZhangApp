/** 数字输入框的文本处理：过滤、解析与夹取，保持纯函数便于测试。 */

export function clampNumber(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

export function formatNumberText(value: number, emptyWhenZero = false): string {
  if (!Number.isFinite(value)) return '';
  if (emptyWhenZero && value === 0) return '';
  return String(value);
}

/** 只保留数字、一个小数点和一个前置负号，避免字母、多个点进入输入框 */
export function sanitizeNumberText(raw: string, allowNegative: boolean): string {
  let next = raw.replace(/[^\d.-]/g, '');
  if (allowNegative) {
    const negative = next.startsWith('-');
    next = next.replace(/-/g, '');
    if (negative) next = `-${next}`;
  } else {
    next = next.replace(/-/g, '');
  }
  const dot = next.indexOf('.');
  if (dot >= 0) {
    next = `${next.slice(0, dot + 1)}${next.slice(dot + 1).replace(/\./g, '')}`;
  }
  return next;
}

/** 返回 null 表示“还在输入中”（如「12.」「-」「.」），此时不应回写数值 */
export function parseNumberText(text: string): number | null {
  if (text === '' || text === '-' || text === '.' || text === '-.') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
