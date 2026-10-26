import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup } from './storage';
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
});
