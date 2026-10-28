import { describe, expect, it } from 'vitest';
import {
  BACKUP_LIMITS,
  MAX_BACKUP_BYTES,
  backupFileError,
  parseBackup,
  summarizeBackup,
} from './storage';
import type { MonthlySettlement, WorkRecord } from './types';

function record(index: number): WorkRecord {
  return {
    id: `record-${index}`,
    date: '2026-10-24',
    templateId: null,
    shiftName: '白班',
    shiftColor: '#D08A2E',
    start: '08:00',
    end: '17:00',
    breakMinutes: 60,
    rate: 20,
    multiplier: 1,
    note: '',
    overtime: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

const template = {
  id: 'template-day',
  name: '白班',
  color: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
};

function backupText(payload: Record<string, unknown>): string {
  return JSON.stringify({
    app: 'shift-ledger',
    version: 3,
    exportedAt: '2026-10-24T00:00:00.000Z',
    templates: [template],
    records: [],
    ...payload,
  });
}

function settlement(adjustments: number): MonthlySettlement {
  return {
    monthKey: '2026-10',
    status: 'pending',
    paidAt: null,
    paidAmount: null,
    note: '',
    updatedAt: 1,
    adjustments: Array.from({ length: adjustments }, (_, index) => ({
      id: `adjustment-${index}`,
      kind: 'bonus' as const,
      label: '奖金',
      amount: 100,
    })),
  };
}

describe('backup size limits', () => {
  it('rejects a file over the byte limit before reading it', () => {
    expect(backupFileError(MAX_BACKUP_BYTES - 1)).toBeNull();
    expect(backupFileError(MAX_BACKUP_BYTES + 1)).toBe('文件太大，请选择备份文件');
  });

  it('refuses a backup with more records than the app supports', () => {
    const rows = Array.from({ length: BACKUP_LIMITS.records + 1 }, (_, index) => record(index));
    expect(() => parseBackup(backupText({ records: rows }))).toThrow(/超过/);
  });

  it('still accepts a backup at the limit', () => {
    const rows = Array.from({ length: BACKUP_LIMITS.records }, (_, index) => record(index));
    expect(parseBackup(backupText({ records: rows })).records).toHaveLength(
      BACKUP_LIMITS.records,
    );
  });

  it('refuses a settlement with too many adjustments', () => {
    const rows = [settlement(BACKUP_LIMITS.adjustmentsPerSettlement + 1)];
    expect(() => parseBackup(backupText({ settlements: rows }))).toThrow(/调整项/);
  });

  it('accepts a settlement at the adjustment limit', () => {
    const rows = [settlement(BACKUP_LIMITS.adjustmentsPerSettlement)];
    expect(parseBackup(backupText({ settlements: rows })).settlements).toHaveLength(1);
  });
});

describe('summarizeBackup', () => {
  it('counts every section for the import dialog', () => {
    const backup = parseBackup(
      backupText({
        records: [record(1), record(2)],
        preferences: { monthlyGoal: 5000, theme: 'dark' },
        settlements: [settlement(0)],
        plans: [],
        planHistory: [],
      }),
    );
    expect(summarizeBackup(backup)).toMatchObject({
      records: 2,
      templates: 1,
      settlements: 1,
      plans: 0,
      planHistory: 0,
      hasPreferences: true,
      exportedAt: '2026-10-24',
    });
  });

  it('omits sections that are absent from an old backup', () => {
    const summary = summarizeBackup(parseBackup(backupText({})));
    expect(summary).toMatchObject({
      records: 0,
      settlements: 0,
      plans: 0,
      planHistory: 0,
      hasPreferences: false,
    });
  });
});
