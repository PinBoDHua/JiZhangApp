import type {
  DayPayRule,
  PlannedShift,
  RecordInput,
  WorkRecord,
} from './types';
import { resolveDayRule } from './dayRule';
import { round2 } from './num';
import { addDaysISO, parseISODate, shiftPay, sortPlans } from './utils';

/**
 * 批量补记（2.2）：
 * - 按日期区间 + 星期筛选出需要补记的日子；
 * - 已有记录的日期自动跳过，避免重复计薪；
 * - 命中的日期如果存在排班，会一并标记完成（与单条「记这一班」一致）。
 */

/** 一次最多补记 62 天，避免误选一年把界面和存储撑爆 */
export const MAX_BATCH_DAYS = 62;

export type RecordDraft = Omit<RecordInput, 'id' | 'createdAt' | 'updatedAt'>;

/** weekdays 使用 Date#getDay()：0 = 周日，6 = 周六 */
export function enumerateBatchDates(
  start: string,
  end: string,
  weekdays: number[],
): string[] {
  if (!start || !end || start > end) return [];
  const selected = new Set(weekdays.filter((day) => day >= 0 && day <= 6));
  if (selected.size === 0) return [];
  const dates: string[] = [];
  let cursor = start;
  for (let guard = 0; guard < MAX_BATCH_DAYS && cursor <= end; guard += 1) {
    if (selected.has(parseISODate(cursor).getDay())) dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

/** 区间总天数（含首尾），用来提示「超出单次上限」 */
export function batchRangeDays(start: string, end: string): number {
  if (!start || !end || start > end) return 0;
  let count = 0;
  let cursor = start;
  while (cursor <= end && count <= 366) {
    count += 1;
    cursor = addDaysISO(cursor, 1);
  }
  return count;
}

export interface BatchDateSlot {
  date: string;
  /** recorded = 当天已有记录，会被跳过 */
  status: 'free' | 'recorded';
  /** 当天已有的排班（用于补记后标记完成） */
  plan: PlannedShift | null;
}

export function planBatchDates(
  dates: string[],
  records: WorkRecord[],
  plans: PlannedShift[],
): BatchDateSlot[] {
  const recorded = new Set(records.map((record) => record.date));
  const plansByDate = new Map<string, PlannedShift[]>();
  sortPlans(plans).forEach((plan) => {
    const list = plansByDate.get(plan.date) ?? [];
    list.push(plan);
    plansByDate.set(plan.date, list);
  });
  return dates.map((date) => ({
    date,
    status: recorded.has(date) ? 'recorded' : 'free',
    plan: (plansByDate.get(date) ?? [])[0] ?? null,
  }));
}

export interface BatchDraft {
  templateId: string | null;
  shiftName: string;
  shiftColor: string;
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
  note: string;
  overtime: RecordDraft['overtime'];
  /** null = 按每天的规则自动带出；数字 = 用户手动指定的统一倍数 */
  multiplier: number | null;
}

/**
 * 生成待落库的记录草稿。每天单独取倍数，因此跨周末的一周补记
 * 会自然得到「工作日 1×、周末 2×」的结果。
 */
export function buildBatchRecords(
  dates: string[],
  draft: BatchDraft,
  dayRule: DayPayRule | undefined,
): RecordDraft[] {
  const shiftName = draft.shiftName.trim() || '补记班次';
  return dates.map((date) => ({
    date,
    templateId: draft.templateId,
    shiftName,
    shiftColor: draft.shiftColor,
    start: draft.start,
    end: draft.end,
    breakMinutes: Math.max(0, Math.round(draft.breakMinutes)),
    rate: Math.max(0, draft.rate),
    multiplier: draft.multiplier ?? resolveDayRule(dayRule, date).multiplier,
    note: draft.note.trim(),
    overtime: draft.overtime,
  }));
}

export interface BatchTotals {
  days: number;
  minutes: number;
  earnings: number;
}

/** 预览用的合计：与正式计薪共用 shiftPay，避免预览和落库不一致 */
export function summarizeBatch(
  dates: string[],
  draft: BatchDraft,
  dayRule: DayPayRule | undefined,
): BatchTotals {
  const records = buildBatchRecords(dates, draft, dayRule);
  let minutes = 0;
  let earnings = 0;
  records.forEach((record) => {
    const pay = shiftPay(record);
    minutes += pay.minutes;
    earnings += pay.total;
  });
  return {
    days: records.length,
    minutes,
    earnings: round2(earnings),
  };
}
