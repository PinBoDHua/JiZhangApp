import {
  type BackupData,
  type BackupPreferences,
  type DayPayRule,
  type MonthlySettlement,
  type PlanHistoryEntry,
  type PlannedShift,
  type ShiftTemplate,
  type WorkRecord,
} from '../types';
import { normalizeDayPayRule } from '../dayRule';
import { normalizeReminderLead } from '../reminders';
import { sortPlans, sortRecords } from '../utils';
import {
  isMonthlySettlement,
  isPlanHistoryEntry,
  isPlannedShift,
  isShiftTemplate,
  isWorkRecord,
  isISODate,
} from './guards';

/**
 * 备份的边界。
 * 这些上限远高于正常使用量（2 万条记录约等于每天记一班记 54 年），
 * 目的是拦住被篡改或误选的大文件，避免一次性把内存和界面撑爆。
 */
export const BACKUP_LIMITS = {
  records: 20_000,
  templates: 200,
  plans: 20_000,
  planHistory: 20_000,
  settlements: 1_200,
  adjustmentsPerSettlement: 200,
} as const;

/** 单次导入的文件体积上限（与设置页提示保持一致） */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

function collectValid<T>(
  rows: unknown[],
  guard: (value: unknown) => value is T,
  label: string,
  limit: number,
): T[] {
  if (rows.length > limit) {
    throw new Error(`备份中的${label}超过 ${limit} 条，请确认文件是否正确`);
  }
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

function sortPlanHistory(history: PlanHistoryEntry[]): PlanHistoryEntry[] {
  return [...history].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
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
  if (item.dayRule && typeof item.dayRule === 'object') {
    preferences.dayRule = normalizeDayPayRule(item.dayRule as Partial<DayPayRule>);
  }
  return preferences;
}

/**
 * 读取 1.x（version 1）、2.0/2.1（version 2）与 2.2（version 3）备份，
 * 统一返回 v3 结构。旧备份缺少日期倍率时保持当前规则不变。
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
  if (
    backup.app !== 'shift-ledger' ||
    (backup.version !== 1 && backup.version !== 2 && backup.version !== 3)
  ) {
    throw new Error('不是工时账本的备份文件');
  }
  if (!Array.isArray(backup.records) || !Array.isArray(backup.templates)) {
    throw new Error('备份内容不完整');
  }
  const records = dedupeById(
    collectValid(backup.records, isWorkRecord, '记录', BACKUP_LIMITS.records),
  );
  const templates = dedupeById(
    collectValid(backup.templates, isShiftTemplate, '班次', BACKUP_LIMITS.templates),
  );
  const settlements = Array.isArray(backup.settlements)
    ? dedupeSettlements(
        collectValid(
          backup.settlements,
          isMonthlySettlement,
          '工资结算',
          BACKUP_LIMITS.settlements,
        ),
      )
    : undefined;
  settlements?.forEach((settlement) => {
    if (settlement.adjustments.length > BACKUP_LIMITS.adjustmentsPerSettlement) {
      throw new Error(
        `备份中 ${settlement.monthKey} 的调整项超过 ${BACKUP_LIMITS.adjustmentsPerSettlement} 条`,
      );
    }
  });
  const plans = Array.isArray(backup.plans)
    ? dedupeById(collectValid(backup.plans, isPlannedShift, '排班', BACKUP_LIMITS.plans))
    : undefined;
  const planHistory = Array.isArray(backup.planHistory)
    ? dedupePlanHistory(
        collectValid(
          backup.planHistory,
          isPlanHistoryEntry,
          '完成排班历史',
          BACKUP_LIMITS.planHistory,
        ),
      )
    : undefined;
  const preferences = normalizeBackupPreferences(backup.preferences);
  return {
    app: 'shift-ledger',
    version: 3,
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
    version: 3,
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

/** 备份文件头部校验：先看体积，避免把超大文件整份读进内存 */
export function backupFileError(size: number): string | null {
  return size > MAX_BACKUP_BYTES ? '文件太大，请选择备份文件' : null;
}

export interface BackupSummary {
  records: number;
  templates: number;
  settlements: number;
  plans: number;
  planHistory: number;
  hasPreferences: boolean;
  exportedAt: string | null;
}

/** 导入确认弹窗用的摘要，集中在一处避免提示语与数据脱节 */
export function summarizeBackup(backup: BackupData): BackupSummary {
  return {
    records: backup.records.length,
    templates: backup.templates.length,
    settlements: backup.settlements?.length ?? 0,
    plans: backup.plans?.length ?? 0,
    planHistory: backup.planHistory?.length ?? 0,
    hasPreferences: Boolean(backup.preferences),
    exportedAt: isISODate(backup.exportedAt.slice(0, 10))
      ? backup.exportedAt.slice(0, 10)
      : null,
  };
}
