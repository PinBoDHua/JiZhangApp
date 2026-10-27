import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildBackup,
  isISODate,
  isTimeHM,
  loadPreferences,
  loadRecords,
  loadActiveShift,
  migrateStorage,
  parseBackup,
  saveRecords,
  saveActiveShift,
} from './storage';
import type {
  ActiveShift,
  BackupPreferences,
  MonthlySettlement,
  PlanHistoryEntry,
  PlannedShift,
  ShiftTemplate,
  WorkRecord,
} from './types';

const template: ShiftTemplate = {
  id: 'template-day',
  name: '白班',
  color: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
};

const record: WorkRecord = {
  id: 'record-1',
  date: '2026-10-24',
  templateId: template.id,
  shiftName: template.name,
  shiftColor: template.color,
  start: template.start,
  end: template.end,
  breakMinutes: template.breakMinutes,
  rate: template.rate,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
};

const preferences: BackupPreferences = { monthlyGoal: 5000, theme: 'system' };

const settlement: MonthlySettlement = {
  monthKey: '2026-10',
  status: 'pending',
  paidAt: null,
  paidAmount: null,
  note: '',
  adjustments: [],
  updatedAt: 1,
};

const makePlan = (overrides: Partial<PlannedShift>): PlannedShift => ({
  id: 'plan-1',
  date: '2026-10-25',
  templateId: template.id,
  shiftName: template.name,
  shiftColor: template.color,
  start: template.start,
  end: template.end,
  breakMinutes: template.breakMinutes,
  rate: template.rate,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const makeHistoryEntry = (overrides: Partial<PlanHistoryEntry>): PlanHistoryEntry => ({
  ...makePlan(overrides),
  status: 'completed',
  recordId: record.id,
  completedAt: 2,
  ...overrides,
});

describe('backup with shift plans', () => {
  it('exports plans sorted and parses them back', () => {
    const backup = buildBackup({
      records: [record],
      templates: [template],
      preferences,
      settlements: [settlement],
      plans: [
        makePlan({ id: 'plan-late', date: '2026-10-26' }),
        makePlan({ id: 'plan-early', date: '2026-10-25' }),
      ],
      planHistory: [
        makeHistoryEntry({ id: 'history-late', date: '2026-10-27' }),
        makeHistoryEntry({ id: 'history-early', date: '2026-10-24' }),
      ],
    });

    expect(backup.version).toBe(3);
    expect(backup.plans?.map((plan) => plan.id)).toEqual(['plan-early', 'plan-late']);
    expect(backup.planHistory?.map((entry) => entry.id)).toEqual([
      'history-early',
      'history-late',
    ]);

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.records).toHaveLength(1);
    expect(parsed.templates).toHaveLength(1);
    expect(parsed.preferences).toEqual(preferences);
    expect(parsed.settlements?.[0].monthKey).toBe('2026-10');
    expect(parsed.plans?.map((plan) => plan.date)).toEqual(['2026-10-25', '2026-10-26']);
    expect(parsed.planHistory?.[0]).toMatchObject({
      id: 'history-early',
      status: 'completed',
      recordId: record.id,
    });
  });

  it('still accepts older backups without plans', () => {
    const legacy = {
      app: 'shift-ledger',
      version: 1,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [record],
    };

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.version).toBe(3);
    expect(parsed.plans).toBeUndefined();
    expect(parsed.planHistory).toBeUndefined();
    expect(parsed.records).toHaveLength(1);
  });

  it('refuses to bake in unreadable plans instead of silently dropping them', () => {
    const broken = {
      app: 'shift-ledger',
      version: 1,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [record],
      plans: [makePlan({}), { id: 'plan-broken', date: '2026-10-26' }],
    };

    expect(() => parseBackup(JSON.stringify(broken))).toThrow('备份中有无法识别的排班');
  });

  it('refuses unreadable settlements and history too', () => {
    const brokenSettlement = {
      app: 'shift-ledger',
      version: 1,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [record],
      settlements: [{ ...settlement, status: 'unknown' }],
    };
    expect(() => parseBackup(JSON.stringify(brokenSettlement))).toThrow(
      '备份中有无法识别的工资结算',
    );

    const brokenHistory = {
      app: 'shift-ledger',
      version: 1,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [record],
      planHistory: [{ ...makePlan({}), status: 'unknown', recordId: null, completedAt: 1 }],
    };
    expect(() => parseBackup(JSON.stringify(brokenHistory))).toThrow(
      '备份中有无法识别的完成排班历史',
    );
  });

  it('rejects dates and times that the app could never have written', () => {
    const backupWith = (item: Record<string, unknown>) => ({
      app: 'shift-ledger',
      version: 1,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [{ ...record, ...item }],
    });

    expect(() => parseBackup(JSON.stringify(backupWith({ date: '2026/10/24' })))).toThrow(
      '备份中有无法识别的记录',
    );
    expect(() => parseBackup(JSON.stringify(backupWith({ date: '2026-02-30' })))).toThrow(
      '备份中有无法识别的记录',
    );
    expect(() => parseBackup(JSON.stringify(backupWith({ start: '8:00' })))).toThrow(
      '备份中有无法识别的记录',
    );
    expect(() => parseBackup(JSON.stringify(backupWith({ end: '24:00' })))).toThrow(
      '备份中有无法识别的记录',
    );
    expect(() => parseBackup(JSON.stringify(backupWith({ rate: Number.NaN })))).toThrow(
      '备份中有无法识别的记录',
    );
    expect(() => parseBackup(JSON.stringify(backupWith({ multiplier: 0 })))).toThrow(
      '备份中有无法识别的记录',
    );
    expect(parseBackup(JSON.stringify(backupWith({}))).records).toHaveLength(1);
  });

  it('validates ISO dates and HH:MM times on their own', () => {
    expect(isISODate('2026-10-24')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-1-1')).toBe(false);
    expect(isISODate(20261024)).toBe(false);
    expect(isTimeHM('00:00')).toBe(true);
    expect(isTimeHM('23:59')).toBe(true);
    expect(isTimeHM('24:00')).toBe(false);
    expect(isTimeHM('9:05')).toBe(false);
    expect(isTimeHM('08:60')).toBe(false);
  });

  it('keeps the newest copy when a merged backup repeats an id', () => {
    const merged = {
      app: 'shift-ledger',
      version: 1,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [
        { ...record, note: '旧' },
        { ...record, note: '新', updatedAt: 9 },
      ],
      plans: [makePlan({ note: '旧' }), makePlan({ note: '新' })],
      settlements: [
        { ...settlement, note: '旧', updatedAt: 1 },
        { ...settlement, note: '新', updatedAt: 2 },
      ],
    };

    const parsed = parseBackup(JSON.stringify(merged));
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].note).toBe('新');
    expect(parsed.plans).toHaveLength(1);
    expect(parsed.plans?.[0].note).toBe('新');
    expect(parsed.settlements).toHaveLength(1);
    expect(parsed.settlements?.[0].note).toBe('新');
  });
});

describe('backup v2', () => {
  const overtime = { standardMinutes: 8 * 60, multiplier: 1.5 };

  it('keeps overtime rules, app version and reminder preferences', () => {
    const fullPreferences: BackupPreferences = {
      monthlyGoal: 5000,
      theme: 'dark',
      reminderEnabled: true,
      reminderLeadMinutes: 30,
    };
    const backup = buildBackup({
      records: [{ ...record, overtime }],
      templates: [{ ...template, overtime }],
      preferences: fullPreferences,
      settlements: [],
      plans: [makePlan({ overtime })],
      planHistory: [],
      appVersion: '2.0.0',
    });

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.version).toBe(3);
    expect(parsed.appVersion).toBe('2.0.0');
    expect(parsed.templates[0].overtime).toEqual(overtime);
    expect(parsed.records[0].overtime).toEqual(overtime);
    expect(parsed.plans?.[0].overtime).toEqual(overtime);
    expect(parsed.preferences).toEqual(fullPreferences);
  });

  it('rejects invalid overtime rules instead of silently changing pay', () => {
    const broken = {
      app: 'shift-ledger',
      version: 2,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [{ ...record, overtime: { standardMinutes: 0, multiplier: 1.5 } }],
    };
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(
      '备份中有无法识别的记录',
    );
  });

  it('drops a malformed preferences block but keeps the rest importable', () => {
    const backup = {
      app: 'shift-ledger',
      version: 2,
      exportedAt: '2026-10-25T00:00:00.000Z',
      templates: [template],
      records: [record],
      preferences: { monthlyGoal: '5000', theme: 'dark' },
    };
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.preferences).toBeUndefined();
    expect(parsed.records).toHaveLength(1);
  });
});

describe('storage v1 -> v2 migration', () => {
  const globalScope = globalThis as { localStorage?: Storage };
  const originalStorage = globalScope.localStorage;
  let store: Map<string, string>;

  const fakeStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;

  beforeEach(() => {
    store = new Map();
    globalScope.localStorage = fakeStorage;
  });

  afterEach(() => {
    if (originalStorage) {
      globalScope.localStorage = originalStorage;
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('copies v1 data to v2, keeps the old keys and reads it back', () => {
    store.set('shift-ledger.records.v1', JSON.stringify([record]));
    store.set('shift-ledger.templates.v1', JSON.stringify([template]));
    store.set(
      'shift-ledger.preferences.v1',
      JSON.stringify({
        monthlyGoal: 3000,
        theme: 'dark',
        lastBackupAt: 123,
        reminderEnabled: true,
        reminderLeadMinutes: 30,
      }),
    );

    const meta = migrateStorage();
    expect(meta?.schemaVersion).toBe(2);
    expect(store.get('shift-ledger.meta.v2')).toContain('"schemaVersion":2');
    expect(store.get('shift-ledger.records.v2')).toBe(
      store.get('shift-ledger.records.v1'),
    );
    expect(store.get('shift-ledger.records.v1')).not.toBeUndefined();
    expect(loadRecords()).toHaveLength(1);
    expect(loadPreferences()).toMatchObject({
      monthlyGoal: 3000,
      theme: 'dark',
      reminderEnabled: true,
      reminderLeadMinutes: 30,
    });
  });

  it('never overwrites existing v2 data, even on later runs', () => {
    store.set('shift-ledger.records.v1', JSON.stringify([record]));
    store.set('shift-ledger.records.v2', JSON.stringify([]));
    migrateStorage();
    expect(loadRecords()).toEqual([]);

    store.set('shift-ledger.records.v1', JSON.stringify([record, record]));
    store.set('shift-ledger.meta.v2', JSON.stringify({ schemaVersion: 2 }));
    migrateStorage();
    expect(loadRecords()).toEqual([]);
  });

  it('writes new changes to v2 and keeps v1 untouched', () => {
    store.set('shift-ledger.records.v1', JSON.stringify([]));
    migrateStorage();
    saveRecords([record]);
    expect(JSON.parse(store.get('shift-ledger.records.v2') ?? '[]')).toHaveLength(1);
    expect(store.get('shift-ledger.records.v1')).toBe('[]');
  });

  it('does not resurrect an abandoned timing shift from the legacy key', () => {
    const active: ActiveShift = {
      templateId: template.id,
      sourcePlanId: null,
      shiftName: template.name,
      shiftColor: template.color,
      startDate: '2026-10-26',
      startTime: '08:00',
      startedAt: 1,
      pausedAt: null,
      pausedMs: 0,
      breakMinutes: 60,
      rate: 20,
      multiplier: 1,
      note: '',
    };
    store.set('shift-ledger.active-shift.v1', JSON.stringify(active));
    migrateStorage();
    expect(loadActiveShift()).toMatchObject({ shiftName: template.name });

    saveActiveShift(null);
    expect(store.get('shift-ledger.active-shift.v1')).toBeUndefined();
    expect(loadActiveShift()).toBeNull();
  });
});

describe('backup v3 day rules', () => {
  it('round-trips weekend and holiday multipliers', () => {
    const withDayRule: BackupPreferences = {
      monthlyGoal: 8000,
      theme: 'system',
      dayRule: {
        enabled: true,
        weekendMultiplier: 1.5,
        holidayMultiplier: 3,
        holidays: [{ date: '2026-10-01', label: '国庆' }],
      },
    };
    const backup = buildBackup({
      records: [],
      templates: [template],
      preferences: withDayRule,
      settlements: [],
      plans: [],
      planHistory: [],
      appVersion: '2.2.0',
    });

    expect(backup.version).toBe(3);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.version).toBe(3);
    expect(parsed.preferences?.dayRule).toEqual(withDayRule.dayRule);
  });

  it('imports a v2 backup without inventing a day rule', () => {
    const v2 = {
      app: 'shift-ledger',
      version: 2,
      exportedAt: '2026-10-26T00:00:00.000Z',
      templates: [template],
      records: [record],
    };
    const parsed = parseBackup(JSON.stringify(v2));
    expect(parsed.version).toBe(3);
    expect(parsed.preferences).toBeUndefined();
  });

  it('drops malformed day rules while keeping the rest of the backup', () => {
    const broken = {
      app: 'shift-ledger',
      version: 3,
      exportedAt: '2026-10-26T00:00:00.000Z',
      templates: [template],
      records: [record],
      preferences: {
        monthlyGoal: 5000,
        theme: 'dark',
        dayRule: {
          enabled: true,
          weekendMultiplier: 'two',
          holidayMultiplier: 3,
          holidays: [],
        },
      },
    };
    const parsed = parseBackup(JSON.stringify(broken));
    expect(parsed.preferences?.dayRule?.weekendMultiplier).toBe(2);
    expect(parsed.preferences?.theme).toBe('dark');
  });
});
