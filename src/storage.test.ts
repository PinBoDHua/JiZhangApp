import { describe, expect, it } from 'vitest';
import { buildBackup, isISODate, isTimeHM, parseBackup } from './storage';
import type {
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
    const backup = buildBackup(
      [record],
      [template],
      preferences,
      [settlement],
      [
        makePlan({ id: 'plan-late', date: '2026-10-26' }),
        makePlan({ id: 'plan-early', date: '2026-10-25' }),
      ],
      [
        makeHistoryEntry({ id: 'history-late', date: '2026-10-27' }),
        makeHistoryEntry({ id: 'history-early', date: '2026-10-24' }),
      ],
    );

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
