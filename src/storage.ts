import {
  DEFAULT_PREFERENCES,
  DEFAULT_TEMPLATES,
  type ActiveShift,
  type AppPreferences,
  type BackupData,
  type BackupPreferences,
  type MonthlySettlement,
  type PlanHistoryEntry,
  type PlannedShift,
  type ShiftTemplate,
  type WorkRecord,
} from './types';
import { normalizeReminderLead } from './reminders';
import { sortPlans, sortRecords } from './utils';

const RECORDS_KEY = 'shift-ledger.records.v1';
const TEMPLATES_KEY = 'shift-ledger.templates.v1';
const PREFERENCES_KEY = 'shift-ledger.preferences.v1';
const ACTIVE_SHIFT_KEY = 'shift-ledger.active-shift.v1';
const SETTLEMENTS_KEY = 'shift-ledger.settlements.v1';
const PLANS_KEY = 'shift-ledger.plans.v1';
const PLAN_HISTORY_KEY = 'shift-ledger.plan-history.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isShiftTemplate(value: unknown): value is ShiftTemplate {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.color === 'string' &&
    typeof item.start === 'string' &&
    typeof item.end === 'string' &&
    typeof item.breakMinutes === 'number' &&
    typeof item.rate === 'number'
  );
}

function isWorkRecord(value: unknown): value is WorkRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.date === 'string' &&
    typeof item.shiftName === 'string' &&
    typeof item.shiftColor === 'string' &&
    typeof item.start === 'string' &&
    typeof item.end === 'string' &&
    typeof item.breakMinutes === 'number' &&
    typeof item.rate === 'number' &&
    typeof item.multiplier === 'number' &&
    typeof item.note === 'string' &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number'
  );
}

export function loadRecords(): WorkRecord[] {
  const records = readJson<unknown>(RECORDS_KEY, []);
  if (!Array.isArray(records)) return [];
  return records.filter(isWorkRecord);
}

export function saveRecords(records: WorkRecord[]): void {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function loadTemplates(): ShiftTemplate[] {
  const templates = readJson<unknown>(TEMPLATES_KEY, DEFAULT_TEMPLATES);
  if (!Array.isArray(templates)) return DEFAULT_TEMPLATES;
  const valid = templates.filter(isShiftTemplate);
  return valid;
}

export function saveTemplates(templates: ShiftTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

function isBackupPreferences(value: unknown): value is BackupPreferences {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.monthlyGoal === 'number' &&
    item.monthlyGoal >= 0 &&
    (item.theme === 'system' || item.theme === 'light' || item.theme === 'dark')
  );
}

export function loadPreferences(): AppPreferences {
  const stored = readJson<unknown>(PREFERENCES_KEY, DEFAULT_PREFERENCES);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFERENCES };
  const item = stored as Record<string, unknown>;
  return {
    monthlyGoal:
      typeof item.monthlyGoal === 'number' && Number.isFinite(item.monthlyGoal) && item.monthlyGoal >= 0
        ? item.monthlyGoal
        : 0,
    theme: item.theme === 'light' || item.theme === 'dark' ? item.theme : 'system',
    lastBackupAt:
      typeof item.lastBackupAt === 'number' && item.lastBackupAt > 0 ? item.lastBackupAt : null,
    reminderEnabled: item.reminderEnabled === true,
    reminderLeadMinutes:
      typeof item.reminderLeadMinutes === 'number'
        ? normalizeReminderLead(item.reminderLeadMinutes)
        : DEFAULT_PREFERENCES.reminderLeadMinutes,
  };
}

export function savePreferences(preferences: AppPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

function isActiveShift(value: unknown): value is ActiveShift {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    (item.templateId === null || typeof item.templateId === 'string') &&
    (item.sourcePlanId === undefined ||
      item.sourcePlanId === null ||
      typeof item.sourcePlanId === 'string') &&
    typeof item.shiftName === 'string' &&
    typeof item.shiftColor === 'string' &&
    typeof item.startDate === 'string' &&
    typeof item.startTime === 'string' &&
    typeof item.startedAt === 'number' &&
    Number.isFinite(item.startedAt) &&
    item.startedAt > 0 &&
    (item.pausedAt === undefined ||
      item.pausedAt === null ||
      (typeof item.pausedAt === 'number' && Number.isFinite(item.pausedAt))) &&
    (item.pausedMs === undefined ||
      (typeof item.pausedMs === 'number' && Number.isFinite(item.pausedMs) && item.pausedMs >= 0)) &&
    typeof item.breakMinutes === 'number' &&
    item.breakMinutes >= 0 &&
    typeof item.rate === 'number' &&
    item.rate >= 0 &&
    typeof item.multiplier === 'number' &&
    item.multiplier > 0 &&
    typeof item.note === 'string'
  );
}

export function loadActiveShift(): ActiveShift | null {
  const stored = readJson<unknown>(ACTIVE_SHIFT_KEY, null);
  if (!isActiveShift(stored)) return null;
  if (!stored || typeof stored !== 'object') return null;
  const item = stored as ActiveShift & Record<string, unknown>;
  return {
    ...item,
    sourcePlanId:
      typeof item.sourcePlanId === 'string' ? item.sourcePlanId : null,
    pausedAt: typeof item.pausedAt === 'number' ? item.pausedAt : null,
    pausedMs: typeof item.pausedMs === 'number' && item.pausedMs >= 0 ? item.pausedMs : 0,
  };
}

export function saveActiveShift(shift: ActiveShift | null): void {
  if (shift) {
    localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(shift));
  } else {
    localStorage.removeItem(ACTIVE_SHIFT_KEY);
  }
}

function isMonthlySettlement(value: unknown): value is MonthlySettlement {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(item.monthKey)) return false;
  if (item.status !== 'pending' && item.status !== 'paid') return false;
  if (!(item.paidAt === null || typeof item.paidAt === 'string')) return false;
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

export function loadSettlements(): MonthlySettlement[] {
  const stored = readJson<unknown>(SETTLEMENTS_KEY, []);
  if (!Array.isArray(stored)) return [];
  const map = new Map<string, MonthlySettlement>();
  stored.filter(isMonthlySettlement).forEach((settlement) => {
    const existing = map.get(settlement.monthKey);
    if (!existing || settlement.updatedAt >= existing.updatedAt) {
      map.set(settlement.monthKey, settlement);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function saveSettlements(settlements: MonthlySettlement[]): void {
  localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(settlements));
}

function isPlannedShift(value: unknown): value is PlannedShift {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.date === 'string' &&
    (item.templateId === null || typeof item.templateId === 'string') &&
    typeof item.shiftName === 'string' &&
    typeof item.shiftColor === 'string' &&
    typeof item.start === 'string' &&
    typeof item.end === 'string' &&
    typeof item.breakMinutes === 'number' &&
    item.breakMinutes >= 0 &&
    typeof item.rate === 'number' &&
    item.rate >= 0 &&
    typeof item.multiplier === 'number' &&
    item.multiplier > 0 &&
    typeof item.note === 'string' &&
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

function isPlanHistoryEntry(value: unknown): value is PlanHistoryEntry {
  if (!isPlannedShift(value)) return false;
  const item = value as unknown as Record<string, unknown>;
  return (
    (item.status === 'completed' || item.status === 'skipped') &&
    (item.recordId === null || typeof item.recordId === 'string') &&
    typeof item.completedAt === 'number' &&
    Number.isFinite(item.completedAt)
  );
}

function sortPlanHistory(history: PlanHistoryEntry[]): PlanHistoryEntry[] {
  return [...history].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
}

export function loadPlans(): PlannedShift[] {
  const stored = readJson<unknown>(PLANS_KEY, []);
  if (!Array.isArray(stored)) return [];
  const map = new Map<string, PlannedShift>();
  stored.filter(isPlannedShift).forEach((plan) => map.set(plan.id, plan));
  return sortPlans(Array.from(map.values()));
}

export function savePlans(plans: PlannedShift[]): void {
  localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
}

export function loadPlanHistory(): PlanHistoryEntry[] {
  const stored = readJson<unknown>(PLAN_HISTORY_KEY, []);
  if (!Array.isArray(stored)) return [];
  const map = new Map<string, PlanHistoryEntry>();
  stored.filter(isPlanHistoryEntry).forEach((entry) => {
    const existing = map.get(entry.id);
    if (!existing || entry.completedAt >= existing.completedAt) {
      map.set(entry.id, entry);
    }
  });
  return sortPlanHistory(Array.from(map.values()));
}

export function savePlanHistory(history: PlanHistoryEntry[]): void {
  localStorage.setItem(PLAN_HISTORY_KEY, JSON.stringify(history));
}

export function parseBackup(text: string): BackupData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('备份内容不完整');
  const backup = data as Record<string, unknown>;
  if (backup.app !== 'shift-ledger' || backup.version !== 1) {
    throw new Error('不是工时账本的备份文件');
  }
  if (!Array.isArray(backup.records) || !Array.isArray(backup.templates)) {
    throw new Error('备份内容不完整');
  }
  const records = backup.records.filter(isWorkRecord);
  const templates = backup.templates.filter(isShiftTemplate);
  if (records.length !== backup.records.length || templates.length !== backup.templates.length) {
    throw new Error('备份中有无法识别的数据');
  }
  const settlements = Array.isArray(backup.settlements)
    ? backup.settlements.filter(isMonthlySettlement)
    : undefined;
  const plans = Array.isArray(backup.plans)
    ? backup.plans.filter(isPlannedShift)
    : undefined;
  const planHistory = Array.isArray(backup.planHistory)
    ? backup.planHistory.filter(isPlanHistoryEntry)
    : undefined;
  return {
    app: 'shift-ledger',
    version: 1,
    exportedAt:
      typeof backup.exportedAt === 'string' ? backup.exportedAt : new Date().toISOString(),
    templates,
    records,
    ...(isBackupPreferences(backup.preferences) ? { preferences: backup.preferences } : {}),
    ...(settlements ? { settlements } : {}),
    ...(plans ? { plans } : {}),
    ...(planHistory ? { planHistory } : {}),
  };
}

export function buildBackup(
  records: WorkRecord[],
  templates: ShiftTemplate[],
  preferences: BackupPreferences,
  settlements: MonthlySettlement[],
  plans: PlannedShift[],
  planHistory: PlanHistoryEntry[],
): BackupData {
  return {
    app: 'shift-ledger',
    version: 1,
    exportedAt: new Date().toISOString(),
    templates,
    records: sortRecords(records),
    preferences,
    settlements: [...settlements].sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    plans: sortPlans(plans),
    planHistory: sortPlanHistory(planHistory),
  };
}
