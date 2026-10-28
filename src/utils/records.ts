/**
 * 记录与排班的集合操作（筛选、排序、分组、汇总、状态判断）。
 *
 * 全是纯函数：不改入参、不读全局状态，因此可以被单测直接锁住。
 * 计薪由 ./pay 提供，这里只负责「哪些记录 / 怎么汇总」。
 */

import type { ActiveShift, PlannedShift, WorkRecord } from '../types';
import { round2 } from '../num';
import { addDaysISO, isOvernight, monthKey, toISODate, toMinutes, todayISO } from './date';
import { recordPay } from './pay';

/* -------------------------------- 排班 -------------------------------- */

/** 丢掉已经有排班的日期，周重复排班不会堆出重复项 */
export function freePlanDates(dates: string[], plans: { date: string }[]): string[] {
  const occupied = new Set(plans.map((plan) => plan.date));
  return dates.filter((date) => !occupied.has(date));
}

export function isPlanPast(plan: PlannedShift, now: Date): boolean {
  const endDate = isOvernight(plan.start, plan.end) ? addDaysISO(plan.date, 1) : plan.date;
  const today = toISODate(now);
  if (endDate < today) return true;
  if (endDate > today) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current > toMinutes(plan.end);
}

export function canStartPlan(plan: PlannedShift, now: Date): boolean {
  if (isPlanPast(plan, now)) return false;
  const today = toISODate(now);
  if (plan.date === today) return true;
  return isOvernight(plan.start, plan.end) && addDaysISO(plan.date, 1) === today;
}

export function sortPlans(plans: PlannedShift[]): PlannedShift[] {
  return [...plans].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
}

/* -------------------------------- 记录 -------------------------------- */

/** 最近一条「不晚于今天」的记录：新建记账时用它带出上次的班次设置 */
export function findLatestRecord(records: WorkRecord[]): WorkRecord | null {
  const today = todayISO();
  const candidates = records.filter((record) => record.date <= today);
  return candidates.reduce<WorkRecord | null>((latest, record) => {
    if (!latest) return record;
    if (record.date !== latest.date) return record.date > latest.date ? record : latest;
    if (record.start !== latest.start) return record.start > latest.start ? record : latest;
    return record.updatedAt > latest.updatedAt ? record : latest;
  }, null);
}

export function recordsInMonth(
  records: WorkRecord[],
  year: number,
  monthIndex: number,
): WorkRecord[] {
  const prefix = monthKey(year, monthIndex);
  return records.filter((record) => record.date.startsWith(prefix));
}

export function recordsInRange(
  records: WorkRecord[],
  start: string,
  end: string,
): WorkRecord[] {
  return records.filter((record) => record.date >= start && record.date <= end);
}

/** 按日期倒序分组，组内按开始时间正序 */
export function groupByDate(records: WorkRecord[]): { date: string; items: WorkRecord[] }[] {
  const groups = new Map<string, WorkRecord[]>();
  records.forEach((record) => {
    const items = groups.get(record.date) ?? [];
    items.push(record);
    groups.set(record.date, items);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      items: [...items].sort((a, b) => a.start.localeCompare(b.start)),
    }));
}

export function sortRecords(records: WorkRecord[]): WorkRecord[] {
  return [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start),
  );
}

export interface RecordsSummary {
  minutes: number;
  earnings: number;
  days: number;
  shifts: number;
  averageRate: number;
  regularMinutes: number;
  overtimeMinutes: number;
  overtimeEarnings: number;
}

/** 一段记录的合计：工时 / 收入 / 出勤天数 / 班次数 / 平均时薪 / 加班拆分 */
export function summarizeRecords(records: WorkRecord[]): RecordsSummary {
  let minutes = 0;
  let earnings = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let overtimeEarnings = 0;
  records.forEach((record) => {
    const pay = recordPay(record);
    minutes += pay.minutes;
    earnings += pay.total;
    regularMinutes += pay.regularMinutes;
    overtimeMinutes += pay.overtimeMinutes;
    overtimeEarnings += pay.overtimePay;
  });
  return {
    minutes,
    earnings: round2(earnings),
    days: new Set(records.map((record) => record.date)).size,
    shifts: records.length,
    averageRate: minutes > 0 ? earnings / (minutes / 60) : 0,
    regularMinutes,
    overtimeMinutes,
    overtimeEarnings: round2(overtimeEarnings),
  };
}

/* -------------------------------- 计时中 ------------------------------- */

export function activePauseMs(shift: ActiveShift, nowMs: number): number {
  const pendingPause = shift.pausedAt ? Math.max(0, nowMs - shift.pausedAt) : 0;
  return Math.max(0, shift.pausedMs + pendingPause);
}

export function activeWorkedMs(shift: ActiveShift, nowMs: number): number {
  return Math.max(0, nowMs - shift.startedAt - activePauseMs(shift, nowMs));
}

export function activeWorkedMinutes(shift: ActiveShift, nowMs: number): number {
  return Math.floor(activeWorkedMs(shift, nowMs) / 60_000);
}
