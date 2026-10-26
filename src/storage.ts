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

const ALL_KEYS = [
  RECORDS_KEY,
  TEMPLATES_KEY,
  PREFERENCES_KEY,
  ACTIVE_SHIFT_KEY,
  SETTLEMENTS_KEY,
  PLANS_KEY,
  PLAN_HISTORY_KEY,
];

export const STORAGE_ERROR_EVENT = 'shift-ledger:storage-error';

export interface StorageErrorDetail {
  key: string;
  message: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function reportStorageError(key: string, error: unknown): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  const detail: StorageErrorDetail = {
    key,
    message: error instanceof Error ? error.message : String(error),
  };
  window.dispatchEvent(new CustomEvent<StorageErrorDetail>(STORAGE_ERROR_EVENT, { detail }));
}

/**
 * 写入失败（存储被禁用、配额已满）不应让应用白屏：只在界面提示用户导出备份。
 */
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    reportStorageError(key, error);
  }
}

/**
 * 原样导出本机数据，供异常兜底或排查使用：不经过任何校验，坏数据也能拿走。
 */
export function readRawStorageSnapshot(): Record<string, string> {
  const dump: Record<string, string> = {};
  ALL_KEYS.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) dump[key] = raw;
    } catch {
      // 读取失败时跳过该键
    }
  });
  return dump;
}

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

function isShiftTemplate(value: unknown): value is ShiftTemplate {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.color === 'string' &&
    isTimeHM(item.start) &&
    isTimeHM(item.end) &&
    isFiniteNumber(item.breakMinutes, 0) &&
    isFiniteNumber(item.rate, 0)
  );
}

function isWorkRecord(value: unknown): value is WorkRecord {
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
  writeJson(RECORDS_KEY, records);
}

export function loadTemplates(): ShiftTemplate[] {
  const templates = readJson<unknown>(TEMPLATES_KEY, DEFAULT_TEMPLATES);
  if (!Array.isArray(templates)) return DEFAULT_TEMPLATES.map((template) => ({ ...template }));
  return templates.filter(isShiftTemplate).map((template) => ({ ...template }));
}

export function saveTemplates(templates: ShiftTemplate[]): void {
  writeJson(TEMPLATES_KEY, templates);
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
  writeJson(PREFERENCES_KEY, preferences);
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
    writeJson(ACTIVE_SHIFT_KEY, shift);
    return;
  }
  try {
    localStorage.removeItem(ACTIVE_SHIFT_KEY);
  } catch (error) {
    reportStorageError(ACTIVE_SHIFT_KEY, error);
  }
}

function isMonthlySettlement(value: unknown): value is MonthlySettlement {
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
  writeJson(SETTLEMENTS_KEY, settlements);
}

function isPlannedShift(value: unknown): value is PlannedShift {
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
  writeJson(PLANS_KEY, plans);
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
  writeJson(PLAN_HISTORY_KEY, history);
}

function collectValid<T>(
  rows: unknown[],
  guard: (value: unknown) => value is T,
  label: string,
): T[] {
  const valid = rows.filter(guard);
  if (valid.length !== rows.length) {
    throw new Error(`备份中有无法识别的${label}`);
  }
  return valid;
}

/** 手工合并过的备份可能带重复 id：保留后出现的副本，避免 React key 冲突和误删两条 */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  if (rows.length < 2) return rows;
  const map = new Map<string, T>();
  rows.forEach((row) => map.set(row.id, row));
  return map.size === rows.length ? rows : Array.from(map.values());
}

function dedupePlanHistory(rows: PlanHistoryEntry[]): PlanHistoryEntry[] {
  if (rows.length < 2) return rows;
  const map = new Map<string, PlanHistoryEntry>();
  rows.forEach((row) => {
    const existing = map.get(row.id);
    if (!existing || row.completedAt >= existing.completedAt) map.set(row.id, row);
  });
  return map.size === rows.length ? rows : Array.from(map.values());
}

function dedupeSettlements(rows: MonthlySettlement[]): MonthlySettlement[] {
  if (rows.length < 2) return rows;
  const map = new Map<string, MonthlySettlement>();
  rows.forEach((row) => {
    const existing = map.get(row.monthKey);
    if (!existing || row.updatedAt >= existing.updatedAt) map.set(row.monthKey, row);
  });
  if (map.size === rows.length) return rows;
  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
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
  const records = dedupeById(collectValid(backup.records, isWorkRecord, '记录'));
  const templates = dedupeById(collectValid(backup.templates, isShiftTemplate, '班次'));
  const settlements = Array.isArray(backup.settlements)
    ? dedupeSettlements(collectValid(backup.settlements, isMonthlySettlement, '工资结算'))
    : undefined;
  const plans = Array.isArray(backup.plans)
    ? dedupeById(collectValid(backup.plans, isPlannedShift, '排班'))
    : undefined;
  const planHistory = Array.isArray(backup.planHistory)
    ? dedupePlanHistory(collectValid(backup.planHistory, isPlanHistoryEntry, '完成排班历史'))
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
