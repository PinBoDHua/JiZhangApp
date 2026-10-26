import type { PlanHistoryEntry, PlanHistoryStatus, PlannedShift, WorkRecord } from './types';
import {
  addDaysISO,
  earningsOf,
  isOvernight,
  parseISODate,
  recordEarnings,
  recordMinutes,
  workedMinutes,
} from './utils';

export const PLAN_MISSED_GRACE_MS = 2 * 60 * 60 * 1000;

export function planEndMs(plan: PlannedShift): number {
  const endDate = isOvernight(plan.start, plan.end) ? addDaysISO(plan.date, 1) : plan.date;
  const date = parseISODate(endDate);
  const [hours, minutes] = plan.end.split(':').map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.getTime();
}

export function isPlanMissed(
  plan: PlannedShift,
  now: Date,
  activePlanId: string | null = null,
  graceMs = PLAN_MISSED_GRACE_MS,
): boolean {
  if (activePlanId && plan.id === activePlanId) return false;
  return now.getTime() - planEndMs(plan) > graceMs;
}

export function findMissedPlans(
  plans: PlannedShift[],
  now: Date,
  activePlanId: string | null = null,
): PlannedShift[] {
  return plans
    .filter((plan) => isPlanMissed(plan, now, activePlanId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function toPlanHistoryEntry(
  plan: PlannedShift,
  status: PlanHistoryStatus,
  recordId: string | null,
  completedAt = Date.now(),
): PlanHistoryEntry {
  return { ...plan, status, recordId, completedAt };
}

export function restorePendingPlan(entry: PlanHistoryEntry): PlannedShift {
  return {
    id: entry.id,
    date: entry.date,
    templateId: entry.templateId,
    shiftName: entry.shiftName,
    shiftColor: entry.shiftColor,
    start: entry.start,
    end: entry.end,
    breakMinutes: entry.breakMinutes,
    rate: entry.rate,
    multiplier: entry.multiplier,
    note: entry.note,
    overtime: entry.overtime,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    reminderEnabled: entry.reminderEnabled,
    reminderLeadMinutes: entry.reminderLeadMinutes,
  };
}

export interface PlanReconciliation {
  totalPlans: number;
  due: number;
  completed: number;
  skipped: number;
  missed: number;
  upcoming: number;
  completionRate: number | null;
  plannedDueMinutes: number;
  plannedDueEarnings: number;
  actualShifts: number;
  actualMinutes: number;
  actualEarnings: number;
  diffShifts: number;
  diffMinutes: number;
  diffEarnings: number;
}

interface ReconciliationInput {
  plans: PlannedShift[];
  history: PlanHistoryEntry[];
  records: WorkRecord[];
  monthPrefix: string;
  now: Date;
  activePlanId?: string | null;
}

export function buildPlanReconciliation({
  plans,
  history,
  records,
  monthPrefix,
  now,
  activePlanId = null,
}: ReconciliationInput): PlanReconciliation {
  const monthPlans = plans.filter((plan) => plan.date.startsWith(monthPrefix));
  const monthHistory = history.filter((entry) => entry.date.startsWith(monthPrefix));
  const monthRecords = records.filter((record) => record.date.startsWith(monthPrefix));
  const recordsById = new Map(monthRecords.map((record) => [record.id, record]));
  const duePlans: PlannedShift[] = [];
  let completed = 0;
  let skipped = 0;
  let missed = 0;
  let upcoming = 0;

  monthHistory.forEach((entry) => {
    if (entry.status === 'skipped') {
      skipped += 1;
      duePlans.push(entry);
      return;
    }
    if (entry.recordId && recordsById.has(entry.recordId)) {
      completed += 1;
      duePlans.push(entry);
      return;
    }
    missed += 1;
    duePlans.push(entry);
  });

  monthPlans.forEach((plan) => {
    if (activePlanId && plan.id === activePlanId) {
      upcoming += 1;
      return;
    }
    if (isPlanMissed(plan, now)) {
      missed += 1;
      duePlans.push(plan);
    } else {
      upcoming += 1;
    }
  });

  const plannedDueMinutes = duePlans.reduce(
    (sum, plan) => sum + workedMinutes(plan.start, plan.end, plan.breakMinutes),
    0,
  );
  const plannedDueEarnings = duePlans.reduce((sum, plan) => sum + earningsOf(plan), 0);
  const actualMinutes = monthRecords.reduce((sum, record) => sum + recordMinutes(record), 0);
  const actualEarnings = monthRecords.reduce((sum, record) => sum + recordEarnings(record), 0);
  const due = completed + skipped + missed;

  return {
    totalPlans: monthPlans.length + monthHistory.length,
    due,
    completed,
    skipped,
    missed,
    upcoming,
    completionRate: due > 0 ? completed / due : null,
    plannedDueMinutes,
    plannedDueEarnings,
    actualShifts: monthRecords.length,
    actualMinutes,
    actualEarnings,
    diffShifts: monthRecords.length - due,
    diffMinutes: actualMinutes - plannedDueMinutes,
    diffEarnings: actualEarnings - plannedDueEarnings,
  };
}
