/**
 * 存储键与迁移（数据层最底层，不依赖任何业务模块）。
 *
 * 数据架构：
 * - 所有集合写入 v2 键；
 * - 首次启动把 1.x 的 v1 键原样复制过来，旧键保留只读，升级不丢数据；
 * - meta 记录迁移版本，后续版本可以在此基础上继续升级。
 * - 2.2 只在偏好里新增可选的 dayRule（日期倍率），键结构不变，因此仍为 2。
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
/** 损坏数据的恢复副本：原文另存一份，避免被后续写入覆盖后彻底找不回 */
const RECOVERY_KEY = 'shift-ledger.recovery.v2';

const LEGACY_RECORDS_KEY = 'shift-ledger.records.v1';
const LEGACY_TEMPLATES_KEY = 'shift-ledger.templates.v1';
const LEGACY_PREFERENCES_KEY = 'shift-ledger.preferences.v1';
const LEGACY_ACTIVE_SHIFT_KEY = 'shift-ledger.active-shift.v1';
const LEGACY_SETTLEMENTS_KEY = 'shift-ledger.settlements.v1';
const LEGACY_PLANS_KEY = 'shift-ledger.plans.v1';
const LEGACY_PLAN_HISTORY_KEY = 'shift-ledger.plan-history.v1';

/** 对外暴露的键名，供跨标签页同步与排查工具使用 */
export const STORAGE_KEYS = {
  meta: META_KEY,
  records: RECORDS_KEY,
  templates: TEMPLATES_KEY,
  preferences: PREFERENCES_KEY,
  activeShift: ACTIVE_SHIFT_KEY,
  settlements: SETTLEMENTS_KEY,
  plans: PLANS_KEY,
  planHistory: PLAN_HISTORY_KEY,
} as const;

export type StorageSlice = keyof typeof STORAGE_KEYS;

/** 1.x 旧键：迁移后保留只读，升级不丢数据 */
export const LEGACY_KEYS = {
  records: LEGACY_RECORDS_KEY,
  templates: LEGACY_TEMPLATES_KEY,
  preferences: LEGACY_PREFERENCES_KEY,
  activeShift: LEGACY_ACTIVE_SHIFT_KEY,
  settlements: LEGACY_SETTLEMENTS_KEY,
  plans: LEGACY_PLANS_KEY,
  planHistory: LEGACY_PLAN_HISTORY_KEY,
} as const;

export const KEY_PAIRS: readonly (readonly [string, string])[] = [
  [RECORDS_KEY, LEGACY_RECORDS_KEY],
  [TEMPLATES_KEY, LEGACY_TEMPLATES_KEY],
  [PREFERENCES_KEY, LEGACY_PREFERENCES_KEY],
  [ACTIVE_SHIFT_KEY, LEGACY_ACTIVE_SHIFT_KEY],
  [SETTLEMENTS_KEY, LEGACY_SETTLEMENTS_KEY],
  [PLANS_KEY, LEGACY_PLANS_KEY],
  [PLAN_HISTORY_KEY, LEGACY_PLAN_HISTORY_KEY],
];

const ALL_KEYS = [META_KEY, RECOVERY_KEY, ...KEY_PAIRS.flatMap(([key, legacy]) => [key, legacy])];
const LEDGER_KEY_SET = new Set(ALL_KEYS);

/** 只认本应用写下的键，避免其它站点的存储事件触发无谓重载 */
export function isLedgerStorageKey(key: string | null): boolean {
  return key !== null && LEDGER_KEY_SET.has(key);
}

export const STORAGE_ERROR_EVENT = 'shift-ledger:storage-error';
/** 读到损坏 JSON 且已保全原文时触发，界面据此提示用户导出副本 */
export const STORAGE_RECOVERY_EVENT = 'shift-ledger:storage-recovery';

export interface StorageErrorDetail {
  key: string;
  message: string;
}

export interface CorruptEntry {
  /** 出问题的存储键 */
  key: string;
  /** 保全时间 */
  at: number;
  /** 原始文本，未做任何加工 */
  raw: string;
}

export type RecoveryMap = Record<string, CorruptEntry>;

export const RECOVERY_STORAGE_KEY = RECOVERY_KEY;

export interface StorageMeta {
  schemaVersion: number;
  migratedFrom: number | null;
  migratedAt: number;
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * 幂等迁移：只复制缺失的 v2 键，不覆盖已有数据；meta 写入失败时下次继续尝试。
 * 返回 null 表示当前环境无法访问 localStorage。
 */
export function migrateStorage(): StorageMeta | null {
  if (!hasLocalStorage()) return null;
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

export function readJson<T>(key: string, legacyKey: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // 解析失败时先保全原文：下面返回的兜底值一旦被用户编辑写回，
      // 原始内容就再也找不回来了
      preserveCorrupt(key, raw);
      return fallback;
    }
  } catch {
    return fallback;
  }
}

/** 读出全部恢复副本；内容坏掉时按空处理，恢复副本本身不应阻断启动 */
export function readRecoveryMap(): RecoveryMap {
  if (!hasLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: RecoveryMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const row = value as Record<string, unknown>;
      if (typeof row.raw !== 'string') return;
      map[key] = {
        key,
        at: typeof row.at === 'number' && Number.isFinite(row.at) ? row.at : 0,
        raw: row.raw,
      };
    });
    return map;
  } catch {
    return {};
  }
}

/** 用户导出副本后清空，下次启动不再重复提醒 */
export function clearRecovery(): void {
  removeStorageKey(RECOVERY_KEY);
}

/** 同一份损坏内容只保全、通知一次；换成新的损坏内容会覆盖旧副本 */
function preserveCorrupt(key: string, raw: string): void {
  try {
    const map = readRecoveryMap();
    if (map[key]?.raw === raw) return;
    map[key] = { key, at: Date.now(), raw };
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(map));
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(
      new CustomEvent<{ key: string }>(STORAGE_RECOVERY_EVENT, { detail: { key } }),
    );
  } catch {
    // 存储已满或被禁用：保全失败也不能影响正常读取
  }
}

export function reportStorageError(key: string, error: unknown): void {
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
export function writeJson(key: string, value: unknown): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    reportStorageError(key, error);
  }
}

export function removeStorageKey(key: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(key);
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
  if (!hasLocalStorage()) return dump;
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
