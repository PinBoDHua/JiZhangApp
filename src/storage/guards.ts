import { isValidOvertimeRule } from '../pay';
import type {
  ActiveShift,
  MonthlySettlement,
  PlanHistoryEntry,
  PlannedShift,
  ShiftTemplate,
  WorkRecord,
} from '../types';

/**
 * 存储与备份共用的类型守卫。
 * 所有从本机存储或备份文件读入的数据都要先过这里，
 * 保证业务层拿到的对象字段完整、数值可用（不会出现 NaN 金额）。
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 只接受 YYYY-MM-DD，且必须是真实存在的日期（2026-02-30 不算） */
export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/** 只接受 24 小时制的 HH:MM */
export function isTimeHM(value: unknown): value is string {
  return typeof value === 'string' && TIME_HM.test(value);
}

function isFiniteNumber(value: unknown, min?: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && (min === undefined || value >= min);
}

function isOptionalOvertime(value: unknown): boolean {
  return value === undefined || value === null || isValidOvertimeRule(value);
}

export function isShiftTemplate(value: unknown): value is ShiftTemplate {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.color === 'string' &&
    isTimeHM(item.start) &&
    isTimeHM(item.end) &&
    isFiniteNumber(item.breakMinutes, 0) &&
    isFiniteNumber(item.rate, 0) &&
    isOptionalOvertime(item.overtime)
  );
}

export function isWorkRecord(value: unknown): value is WorkRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    isISODate(item.date) &&
    typeof item.shiftName === 'string' &&
    typeof item.shiftColor === 'string' &&
    isTimeHM(item.start) &&
    isTimeHM(item.end) &&
    isFiniteNumber(item.breakMinutes, 0) &&
    isFiniteNumber(item.rate, 0) &&
    isFiniteNumber(item.multiplier) &&
    item.multiplier > 0 &&
    typeof item.note === 'string' &&
    isOptionalOvertime(item.overtime) &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number'
  );
}

export function isActiveShift(value: unknown): value is ActiveShift {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    (item.templateId === null || typeof item.templateId === 'string') &&
    (item.sourcePlanId === undefined ||
      item.sourcePlanId === null ||
      typeof item.sourcePlanId === 'string') &&
    typeof item.shiftName === 'string' &&
    typeof item.shiftColor === 'string' &&
    isISODate(item.startDate) &&
    isTimeHM(item.startTime) &&
    typeof item.startedAt === 'number' &&
    Number.isFinite(item.startedAt) &&
    item.startedAt > 0 &&
    (item.pausedAt === undefined ||
      item.pausedAt === null ||
      (typeof item.pausedAt === 'number' && Number.isFinite(item.pausedAt))) &&
    (item.pausedMs === undefined ||
      (typeof item.pausedMs === 'number' && Number.isFinite(item.pausedMs) && item.pausedMs >= 0)) &&
    isFiniteNumber(item.breakMinutes, 0) &&
    isFiniteNumber(item.rate, 0) &&
    isFiniteNumber(item.multiplier) &&
    item.multiplier > 0 &&
    typeof item.note === 'string' &&
    isOptionalOvertime(item.overtime)
  );
}

export function isMonthlySettlement(value: unknown): value is MonthlySettlement {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(item.monthKey)) return false;
  if (item.status !== 'pending' && item.status !== 'paid') return false;
  if (!(item.paidAt === null || isISODate(item.paidAt))) return false;
  if (
    !(
      item.paidAmount === null ||
      (typeof item.paidAmount === 'number' && Number.isFinite(item.paidAmount))
    )
  ) {
    return false;
  }
  if (typeof item.note !== 'string' || typeof item.updatedAt !== 'number') return false;
  if (!Array.isArray(item.adjustments)) return false;
  return item.adjustments.every((adjustment) => {
    if (!adjustment || typeof adjustment !== 'object') return false;
    const row = adjustment as Record<string, unknown>;
    return (
      typeof row.id === 'string' &&
      (row.kind === 'bonus' || row.kind === 'deduction' || row.kind === 'advance') &&
      typeof row.label === 'string' &&
      typeof row.amount === 'number' &&
      Number.isFinite(row.amount) &&
      row.amount >= 0
    );
  });
}

export function isPlannedShift(value: unknown): value is PlannedShift {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    isISODate(item.date) &&
    (item.templateId === null || typeof item.templateId === 'string') &&
    typeof item.shiftName === 'string' &&
    typeof item.shiftColor === 'string' &&
    isTimeHM(item.start) &&
    isTimeHM(item.end) &&
    isFiniteNumber(item.breakMinutes, 0) &&
    isFiniteNumber(item.rate, 0) &&
    isFiniteNumber(item.multiplier) &&
    item.multiplier > 0 &&
    typeof item.note === 'string' &&
    isOptionalOvertime(item.overtime) &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number' &&
    (item.reminderEnabled === undefined || typeof item.reminderEnabled === 'boolean') &&
    (item.reminderLeadMinutes === undefined ||
      item.reminderLeadMinutes === null ||
      (typeof item.reminderLeadMinutes === 'number' &&
        Number.isFinite(item.reminderLeadMinutes) &&
        item.reminderLeadMinutes >= 0))
  );
}

export function isPlanHistoryEntry(value: unknown): value is PlanHistoryEntry {
  if (!isPlannedShift(value)) return false;
  const item = value as unknown as Record<string, unknown>;
  return (
    (item.status === 'completed' || item.status === 'skipped') &&
    (item.recordId === null || typeof item.recordId === 'string') &&
    typeof item.completedAt === 'number' &&
    Number.isFinite(item.completedAt)
  );
}
