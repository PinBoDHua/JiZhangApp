import { DEFAULT_DAY_PAY_RULE, type DayPayRule, type HolidayDate } from './types';
import { parseISODate } from './utils';

/**
 * 日期倍率规则（2.2）：
 * - 周末与节假日可以自动带出计薪倍数，减少每次手改；
 * - 规则只作用于新建记录 / 排班 / 批量补记，写入时仍保存当时的倍数快照；
 * - 未开启时所有日期都按 1× 处理，与 2.1 完全一致。
 */

export const DAY_MULTIPLIER_OPTIONS = [1.25, 1.5, 1.75, 2, 3] as const;

export const MAX_HOLIDAYS = 120;
export const MAX_HOLIDAY_LABEL = 12;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 只接受真实存在的 YYYY-MM-DD，避免 2026-02-30 这类输入混进规则 */
export function isHolidayDateISO(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const matched = DATE_RE.exec(value);
  if (!matched) return false;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (year < 1970 || year > 2100) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

function normalizeMultiplier(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value <= 0 || value > 10) return fallback;
  return Math.round(value * 100) / 100;
}

function normalizeHolidays(value: unknown): HolidayDate[] {
  if (!Array.isArray(value)) return [];
  const map = new Map<string, HolidayDate>();
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    if (!isHolidayDateISO(row.date)) return;
    const label =
      typeof row.label === 'string' ? row.label.trim().slice(0, MAX_HOLIDAY_LABEL) : '';
    map.set(row.date, { date: row.date, label: label || '节假日' });
  });
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_HOLIDAYS);
}

/** 读取本机 / 备份里的规则时统一走这里，坏字段回退到默认值而不是让金额变成 NaN */
export function normalizeDayPayRule(value?: Partial<DayPayRule> | null): DayPayRule {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DAY_PAY_RULE, holidays: [] };
  }
  return {
    enabled: value.enabled === true,
    weekendMultiplier: normalizeMultiplier(
      value.weekendMultiplier,
      DEFAULT_DAY_PAY_RULE.weekendMultiplier,
    ),
    holidayMultiplier: normalizeMultiplier(
      value.holidayMultiplier,
      DEFAULT_DAY_PAY_RULE.holidayMultiplier,
    ),
    holidays: normalizeHolidays(value.holidays),
  };
}

export type DayRuleKind = 'holiday' | 'weekend' | 'workday';

export interface ResolvedDayRule {
  multiplier: number;
  kind: DayRuleKind;
  /** 命中规则时的短标签：节假日名称、周六 / 周日；工作日为空字符串 */
  label: string;
}

export function holidayOf(rule: DayPayRule | undefined, date: string): HolidayDate | null {
  const normalized = normalizeDayPayRule(rule);
  return normalized.holidays.find((item) => item.date === date) ?? null;
}

/** 给定日期 → 应该带出的倍数与命中原因 */
export function resolveDayRule(
  rule: DayPayRule | undefined,
  date: string,
): ResolvedDayRule {
  const normalized = normalizeDayPayRule(rule);
  if (!normalized.enabled) return { multiplier: 1, kind: 'workday', label: '' };
  const holiday = normalized.holidays.find((item) => item.date === date);
  if (holiday) {
    return { multiplier: normalized.holidayMultiplier, kind: 'holiday', label: holiday.label };
  }
  const weekday = parseISODate(date).getDay();
  if (weekday === 0 || weekday === 6) {
    return {
      multiplier: normalized.weekendMultiplier,
      kind: 'weekend',
      label: weekday === 6 ? '周六' : '周日',
    };
  }
  return { multiplier: 1, kind: 'workday', label: '' };
}

/** 1.25 → "1.25"，2 → "2" */
export function formatMultiplier(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** 表单里的一行说明："周末 · 2×"；没有命中规则时返回空字符串 */
export function describeDayRule(rule: DayPayRule | undefined, date: string): string {
  const resolved = resolveDayRule(rule, date);
  if (resolved.kind === 'workday') return '';
  return `${resolved.label} · ${formatMultiplier(resolved.multiplier)}×`;
}

export function upsertHoliday(rule: DayPayRule, holiday: HolidayDate): DayPayRule {
  const normalized = normalizeDayPayRule(rule);
  if (!isHolidayDateISO(holiday.date)) return normalized;
  const label = holiday.label.trim().slice(0, MAX_HOLIDAY_LABEL) || '节假日';
  const next = normalized.holidays.filter((item) => item.date !== holiday.date);
  next.push({ date: holiday.date, label });
  return normalizeDayPayRule({
    ...normalized,
    holidays: next.slice(-MAX_HOLIDAYS),
  });
}

export function removeHoliday(rule: DayPayRule, date: string): DayPayRule {
  const normalized = normalizeDayPayRule(rule);
  return {
    ...normalized,
    holidays: normalized.holidays.filter((item) => item.date !== date),
  };
}
