import {
  DEFAULT_PREFERENCES,
  DEFAULT_TEMPLATES,
  type ActiveShift,
  type AppPreferences,
  type DayPayRule,
  type MonthlySettlement,
  type PlanHistoryEntry,
  type PlannedShift,
  type ShiftTemplate,
  type WorkRecord,
} from '../types';
import { normalizeDayPayRule } from '../dayRule';
import { normalizeReminderLead } from '../reminders';
import { sortPlans } from '../utils';
import {
  LEGACY_KEYS,
  STORAGE_KEYS,
  migrateStorage,
  readJson,
  removeStorageKey,
  writeJson,
} from './keys';
import {
  isActiveShift,
  isMonthlySettlement,
  isPlanHistoryEntry,
  isPlannedShift,
  isShiftTemplate,
  isWorkRecord,
} from './guards';

/**
 * 本机数据仓库（数据层对外入口）。
 * 只负责「读取 → 校验 → 归一化」与「写入」，不含任何业务规则；
 * 页面通过 useAppData 使用这里的读写能力。
 */

export { BACKUP_LIMITS, MAX_BACKUP_BYTES, backupFileError, buildBackup, parseBackup, summarizeBackup } from './backup';
export type { BackupInput, BackupSummary } from './backup';
export {
  SCHEMA_VERSION,
  STORAGE_ERROR_EVENT,
  STORAGE_KEYS,
  isLedgerStorageKey,
  migrateStorage,
  readRawStorageSnapshot,
} from './keys';
export type { StorageErrorDetail, StorageMeta, StorageSlice } from './keys';
export {
  WRITE_DELAY_MS,
  createWriteQueue,
  flushActiveWrites,
  setActiveWriteQueue,
} from './writer';
export type { WriteQueue } from './writer';
export { isISODate, isPlanHistoryEntry, isPlannedShift, isShiftTemplate, isTimeHM, isWorkRecord } from './guards';

const loaders = {
  records(): WorkRecord[] {
    const records = readJson<unknown>(STORAGE_KEYS.records, LEGACY_KEYS.records, []);
    return Array.isArray(records) ? records.filter(isWorkRecord) : [];
  },
  templates(): ShiftTemplate[] {
    const templates = readJson<unknown>(
      STORAGE_KEYS.templates,
      LEGACY_KEYS.templates,
      DEFAULT_TEMPLATES,
    );
    if (!Array.isArray(templates)) return DEFAULT_TEMPLATES.map((template) => ({ ...template }));
    return templates.filter(isShiftTemplate).map((template) => ({ ...template }));
  },
  preferences(): AppPreferences {
    const stored = readJson<unknown>(
      STORAGE_KEYS.preferences,
      LEGACY_KEYS.preferences,
      DEFAULT_PREFERENCES,
    );
    return normalizePreferences(stored);
  },
  activeShift(): ActiveShift | null {
    const stored = readJson<unknown>(
      STORAGE_KEYS.activeShift,
      LEGACY_KEYS.activeShift,
      null,
    );
    if (!isActiveShift(stored)) return null;
    return {
      ...stored,
      sourcePlanId: typeof stored.sourcePlanId === 'string' ? stored.sourcePlanId : null,
      pausedAt: typeof stored.pausedAt === 'number' ? stored.pausedAt : null,
      pausedMs: typeof stored.pausedMs === 'number' && stored.pausedMs >= 0 ? stored.pausedMs : 0,
    };
  },
  settlements(): MonthlySettlement[] {
    const stored = readJson<unknown>(
      STORAGE_KEYS.settlements,
      LEGACY_KEYS.settlements,
      [],
    );
    if (!Array.isArray(stored)) return [];
    const map = new Map<string, MonthlySettlement>();
    stored.filter(isMonthlySettlement).forEach((settlement) => {
      const existing = map.get(settlement.monthKey);
      if (!existing || settlement.updatedAt >= existing.updatedAt) {
        map.set(settlement.monthKey, settlement);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  },
  plans(): PlannedShift[] {
    const stored = readJson<unknown>(STORAGE_KEYS.plans, LEGACY_KEYS.plans, []);
    if (!Array.isArray(stored)) return [];
    const map = new Map<string, PlannedShift>();
    stored.filter(isPlannedShift).forEach((plan) => map.set(plan.id, plan));
    return sortPlans(Array.from(map.values()));
  },
  planHistory(): PlanHistoryEntry[] {
    const stored = readJson<unknown>(
      STORAGE_KEYS.planHistory,
      LEGACY_KEYS.planHistory,
      [],
    );
    if (!Array.isArray(stored)) return [];
    const map = new Map<string, PlanHistoryEntry>();
    stored.filter(isPlanHistoryEntry).forEach((entry) => {
      const existing = map.get(entry.id);
      if (!existing || entry.completedAt >= existing.completedAt) {
        map.set(entry.id, entry);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );
  },
};

/** 偏好设置归一化：任何一项坏掉都回退到默认值，不影响其它设置 */
export function normalizePreferences(stored: unknown): AppPreferences {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFERENCES };
  const item = stored as Record<string, unknown>;
  return {
    monthlyGoal:
      typeof item.monthlyGoal === 'number' &&
      Number.isFinite(item.monthlyGoal) &&
      item.monthlyGoal >= 0
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
    dayRule: normalizeDayPayRule(item.dayRule as Partial<DayPayRule> | undefined),
  };
}

export function loadRecords(): WorkRecord[] {
  migrateStorage();
  return loaders.records();
}

export function saveRecords(records: WorkRecord[]): void {
  writeJson(STORAGE_KEYS.records, records);
}

export function loadTemplates(): ShiftTemplate[] {
  migrateStorage();
  return loaders.templates();
}

export function saveTemplates(templates: ShiftTemplate[]): void {
  writeJson(STORAGE_KEYS.templates, templates);
}

export function loadPreferences(): AppPreferences {
  migrateStorage();
  return loaders.preferences();
}

export function savePreferences(preferences: AppPreferences): void {
  writeJson(STORAGE_KEYS.preferences, preferences);
}

export function loadActiveShift(): ActiveShift | null {
  migrateStorage();
  return loaders.activeShift();
}

export function saveActiveShift(shift: ActiveShift | null): void {
  if (shift) {
    writeJson(STORAGE_KEYS.activeShift, shift);
    return;
  }
  // 迁移后的旧键只读，但进行中的计时是临时数据：不清掉会在下次启动被读回来
  removeStorageKey(STORAGE_KEYS.activeShift);
  removeStorageKey(LEGACY_KEYS.activeShift);
}

export function loadSettlements(): MonthlySettlement[] {
  migrateStorage();
  return loaders.settlements();
}

export function saveSettlements(settlements: MonthlySettlement[]): void {
  writeJson(STORAGE_KEYS.settlements, settlements);
}

export function loadPlans(): PlannedShift[] {
  migrateStorage();
  return loaders.plans();
}

export function savePlans(plans: PlannedShift[]): void {
  writeJson(STORAGE_KEYS.plans, plans);
}

export function loadPlanHistory(): PlanHistoryEntry[] {
  migrateStorage();
  return loaders.planHistory();
}

export function savePlanHistory(history: PlanHistoryEntry[]): void {
  writeJson(STORAGE_KEYS.planHistory, history);
}

export interface LedgerSnapshot {
  records: WorkRecord[];
  templates: ShiftTemplate[];
  preferences: AppPreferences;
  activeShift: ActiveShift | null;
  settlements: MonthlySettlement[];
  plans: PlannedShift[];
  planHistory: PlanHistoryEntry[];
}

/**
 * 一次读入全部集合：迁移只做一次，meta 只解析一次。
 * 首次启动与跨标签页同步都走这里，比逐个 load 少 6 次 JSON 解析。
 */
export function loadLedger(): LedgerSnapshot {
  migrateStorage();
  return {
    records: loaders.records(),
    templates: loaders.templates(),
    preferences: loaders.preferences(),
    activeShift: loaders.activeShift(),
    settlements: loaders.settlements(),
    plans: loaders.plans(),
    planHistory: loaders.planHistory(),
  };
}

/** 存储异常时给用户的统一提示（App 与错误页共用同一句话） */
export const STORAGE_ERROR_MESSAGE = '保存失败：本地存储不可用或空间已满，请先导出备份';
