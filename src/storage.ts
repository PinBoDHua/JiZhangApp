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
import { isValidOvertimeRule } from './pay';
import { normalizeReminderLead } from './reminders';
import { sortPlans, sortRecords } from './utils';

/**
 * 2.0 数据架构：
 * - 所有集合写入 v2 键；
 * - 首次启动把 1.x 的 v1 键原样复制过来，旧键保留只读，升级不丢数据；
 * - meta 记录迁移版本，后续版本可以在此基础上继续升级。
 */
export const SCHEMA_VERSION = 2;

const META_KEY = 'shift-ledger.meta.v2';
const RECORDS_KEY = 'shift-ledger.records.v2';
const TEMPLATES_KEY = 'shift-ledger.templates.v2';
const PREFERENCES_KEY = 'shift-ledger.preferences.v2';
const ACTIVE_SHIFT_KEY = 'shift-ledger.active-shift.v2';
const SETTLEMENTS_KEY = 'shift-ledger.settlements.v2';
const PLANS_KEY = 'shift-ledger.plans.v2';
const PLAN_HISTORY_KEY = 'shift-ledger.plan-history.v2';

const LEGACY_RECORDS_KEY = 'shift-ledger.records.v1';
const LEGACY_TEMPLATES_KEY = 'shift-ledger.templates.v1';
const LEGACY_PREFERENCES_KEY = 'shift-ledger.preferences.v1';
const LEGACY_ACTIVE_SHIFT_KEY = 'shift-ledger.active-shift.v1';
const LEGACY_SETTLEMENTS_KEY = 'shift-ledger.settlements.v1';
const LEGACY_PLANS_KEY = 'shift-ledger.plans.v1';
const LEGACY_PLAN_HISTORY_KEY = 'shift-ledger.plan-history.v1';

const KEY_PAIRS: readonly (readonly [string, string])[] = [
  [RECORDS_KEY, LEGACY_RECORDS_KEY],
  [TEMPLATES_KEY, LEGACY_TEMPLATES_KEY],
  [PREFERENCES_KEY, LEGACY_PREFERENCES_KEY],
  [ACTIVE_SHIFT_KEY, LEGACY_ACTIVE_SHIFT_KEY],
  [SETTLEMENTS_KEY, LEGACY_SETTLEMENTS_KEY],
  [PLANS_KEY, LEGACY_PLANS_KEY],
  [PLAN_HISTORY_KEY, LEGACY_PLAN_HISTORY_KEY],
];

const ALL_KEYS = [
  META_KEY,
  ...KEY_PAIRS.flatMap(([key, legacy]) => [key, legacy]),
];

export const STORAGE_ERROR_EVENT = 'shift-ledger:storage-error';

export interface StorageErrorDetail {
  key: string;
  message: string;
}

export interface StorageMeta {
  schemaVersion: number;
  migratedFrom: number | null;
  migratedAt: number;
}

/**
 * 幂等迁移：只复制缺失的 v2 键，不覆盖已有数据；meta 写入失败时下次继续尝试。
 * 返回 null 表示当前环境无法访问 localStorage。
 */
export function migrateStorage(): StorageMeta | null {
  try {
    const rawMeta = localStorage.getItem(META_KEY);
    if (rawMeta) {
      const parsed = JSON.parse(rawMeta) as Partial<StorageMeta> | null;
      if (parsed && parsed.schemaVersion === SCHEMA_VERSION) {
        return {
          schemaVersion: SCHEMA_VERSION,
          migratedFrom:
            typeof parsed.migratedFrom === 'number' ? parsed.migratedFrom : null,
          migratedAt: typeof parsed.migratedAt === 'number' ? parsed.migratedAt : 0,
        };
      }
    }
    let copied = 0;
    KEY_PAIRS.forEach(([key, legacyKey]) => {
      if (localStorage.getItem(key) === null) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy !== null) {
          localStorage.setItem(key, legacy);
          copied += 1;
        }
      }
    });
    const meta: StorageMeta = {
      schemaVersion: SCHEMA_VERSION,
      migratedFrom: copied > 0 ? 1 : null,
      migratedAt: Date.now(),
    };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    return meta;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, legacyKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
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
 * 同时包含 v2 与旧版 v1 键，迁移前后都可排查。
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

function isOptionalOvertime(value: unknown): boolean {
  return value === undefined || value === null || isValidOvertimeRule(value);
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
    isFiniteNumber(item.rate, 0) &&
    isOptionalOvertime(item.overtime)
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
    isOptionalOvertime(item.overtime) &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number'
  );
}

export function loadRecords(): WorkRecord[] {
  migrateStorage();
  const records = readJson<unknown>(RECORDS_KEY, LEGACY_RECORDS_KEY, []);
  if (!Array.isArray(records)) return [];
  return records.filter(isWorkRecord);
}

export function saveRecords(records: WorkRecord[]): void {
  writeJson(RECORDS_KEY, records);
}

export function loadTemplates(): ShiftTemplate[] {
  migrateStorage();
  const templates = readJson<unknown>(TEMPLATES_KEY, LEGACY_TEMPLATES_KEY, DEFAULT_TEMPLATES);
  if (!Array.isArray(templates)) return DEFAULT_TEMPLATES.map((template) => ({ ...template }));
  return templates.filter(isShiftTemplate).map((template) => ({ ...template }));
}

export function saveTemplates(templates: ShiftTemplate[]): void {
  writeJson(TEMPLATES_KEY, templates);
}

/** 兼容 1.x 备份：早期只保存目标与主题；2.0 起额外保存提醒设置。 */
function normalizeBackupPreferences(value: unknown): BackupPreferences | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.monthlyGoal !== 'number' ||
    !Number.isFinite(item.monthlyGoal) ||
    item.monthlyGoal < 0
  ) {
    return undefined;
  }
  if (item.theme !== 'system' && item.theme !== 'light' && item.theme !== 'dark') {
    return undefined;
  }
  const preferences: BackupPreferences = {
    monthlyGoal: item.monthlyGoal,
    theme: item.theme,
  };
  if (typeof item.reminderEnabled === 'boolean') {
    preferences.reminderEnabled = item.reminderEnabled;
  }
  if (
    typeof item.reminderLeadMinutes === 'number' &&
    Number.isFinite(item.reminderLeadMinutes)
  ) {
    preferences.reminderLeadMinutes = normalizeReminderLead(item.reminderLeadMinutes);
  }
  return preferences;
}

export function loadPreferences(): AppPreferences {
  migrateStorage();
  const stored = readJson<unknown>(PREFERENCES_KEY, LEGACY_PREFERENCES_KEY, DEFAULT_PREFERENCES);
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
    typeof item.note === 'string' &&
    isOptionalOvertime(item.overtime)
  );
}

export function loadActiveShift(): ActiveShift | null {
  migrateStorage();
  const stored = readJson<unknown>(ACTIVE_SHIFT_KEY, LEGACY_ACTIVE_SHIFT_KEY, null);
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
    // 迁移后的旧键只读，但进行中的计时是临时数据：不清掉会在下次启动被读回来
    localStorage.removeItem(LEGACY_ACTIVE_SHIFT_KEY);
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
  migrateStorage();
  const stored = readJson<unknown>(SETTLEMENTS_KEY, LEGACY_SETTLEMENTS_KEY, []);
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
  migrateStorage();
  const stored = readJson<unknown>(PLANS_KEY, LEGACY_PLANS_KEY, []);
  if (!Array.isArray(stored)) return [];
  const map = new Map<string, PlannedShift>();
  stored.filter(isPlannedShift).forEach((plan) => map.set(plan.id, plan));
  return sortPlans(Array.from(map.values()));
}

export function savePlans(plans: PlannedShift[]): void {
  writeJson(PLANS_KEY, plans);
}

export function loadPlanHistory(): PlanHistoryEntry[] {
  migrateStorage();
  const stored = readJson<unknown>(PLAN_HISTORY_KEY, LEGACY_PLAN_HISTORY_KEY, []);
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

/**
 * 读取 1.x（version 1）与 2.0（version 2）备份，统一返回 v2 结构。
 * 2.0 备份多出应用版本与提醒设置，旧备份导入时保持现有提醒设置不变。
 */
export function parseBackup(text: string): BackupData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('备份内容不完整');
  const backup = data as Record<string, unknown>;
  if (backup.app !== 'shift-ledger' || (backup.version !== 1 && backup.version !== 2)) {
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
  const preferences = normalizeBackupPreferences(backup.preferences);
  return {
    app: 'shift-ledger',
    version: 2,
    ...(typeof backup.appVersion === 'string' ? { appVersion: backup.appVersion } : {}),
    exportedAt:
      typeof backup.exportedAt === 'string' ? backup.exportedAt : new Date().toISOString(),
    templates,
    records,
    ...(preferences ? { preferences } : {}),
    ...(settlements ? { settlements } : {}),
    ...(plans ? { plans } : {}),
    ...(planHistory ? { planHistory } : {}),
  };
}

export interface BackupInput {
  records: WorkRecord[];
  templates: ShiftTemplate[];
  preferences: BackupPreferences;
  settlements: MonthlySettlement[];
  plans: PlannedShift[];
  planHistory: PlanHistoryEntry[];
  appVersion?: string;
}

export function buildBackup({
  records,
  templates,
  preferences,
  settlements,
  plans,
  planHistory,
  appVersion,
}: BackupInput): BackupData {
  return {
    app: 'shift-ledger',
    version: 2,
    ...(appVersion ? { appVersion } : {}),
    exportedAt: new Date().toISOString(),
    templates,
    records: sortRecords(records),
    preferences,
    settlements: [...settlements].sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    plans: sortPlans(plans),
    planHistory: sortPlanHistory(planHistory),
  };
}
