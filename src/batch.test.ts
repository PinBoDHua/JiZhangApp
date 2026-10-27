import { describe, expect, it } from 'vitest';
import {
  batchRangeDays,
  buildBatchRecords,
  enumerateBatchDates,
  MAX_BATCH_DAYS,
  planBatchDates,
  summarizeBatch,
  type BatchDraft,
} from './batch';
import { DEFAULT_DAY_PAY_RULE } from './types';
import type { PlannedShift, WorkRecord } from './types';

const draft: BatchDraft = {
  templateId: 'template-day',
  shiftName: '白班',
  shiftColor: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  note: '',
  overtime: null,
  multiplier: null,
};

const dayRule = {
  ...DEFAULT_DAY_PAY_RULE,
  enabled: true,
  weekendMultiplier: 2,
  holidayMultiplier: 3,
};

const record = (date: string): WorkRecord => ({
  id: `record-${date}`,
  date,
  templateId: 'template-day',
  shiftName: '白班',
  shiftColor: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
});

const plan = (date: string): PlannedShift => ({
  id: `plan-${date}`,
  date,
  templateId: 'template-day',
  shiftName: '白班',
  shiftColor: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
});

describe('batch backfill', () => {
  it('enumerates a date range and filters by weekday', () => {
    expect(enumerateBatchDates('2026-10-26', '2026-11-01', [1, 2, 3, 4, 5])).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
    expect(enumerateBatchDates('2026-10-31', '2026-11-01', [0, 6])).toEqual([
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('returns nothing for an inverted or empty selection', () => {
    expect(enumerateBatchDates('2026-11-01', '2026-10-26', [1])).toEqual([]);
    expect(enumerateBatchDates('2026-10-26', '2026-11-01', [])).toEqual([]);
    expect(enumerateBatchDates('', '2026-11-01', [1])).toEqual([]);
  });

  it('caps a single batch at 62 days', () => {
    const dates = enumerateBatchDates('2026-01-01', '2026-12-31', [0, 1, 2, 3, 4, 5, 6]);
    expect(dates).toHaveLength(MAX_BATCH_DAYS);
    expect(batchRangeDays('2026-10-26', '2026-11-01')).toBe(7);
    expect(batchRangeDays('2026-11-01', '2026-10-26')).toBe(0);
  });

  it('marks recorded days as taken and links the existing plan', () => {
    const slots = planBatchDates(
      ['2026-10-26', '2026-10-27', '2026-10-28'],
      [record('2026-10-27')],
      [plan('2026-10-28')],
    );
    expect(slots.map((slot) => slot.status)).toEqual(['free', 'recorded', 'free']);
    expect(slots[2].plan?.id).toBe('plan-2026-10-28');
  });

  it('applies the day rule per date when no multiplier is forced', () => {
    const records = buildBatchRecords(
      ['2026-10-30', '2026-10-31'],
      draft,
      dayRule,
    );
    expect(records[0].multiplier).toBe(1);
    expect(records[1].multiplier).toBe(2);
  });

  it('keeps a manually chosen multiplier for every day', () => {
    const records = buildBatchRecords(
      ['2026-10-30', '2026-10-31'],
      { ...draft, multiplier: 1.5 },
      dayRule,
    );
    expect(records.map((item) => item.multiplier)).toEqual([1.5, 1.5]);
  });

  it('summarizes net minutes and pay with the shared pay engine', () => {
    const totals = summarizeBatch(['2026-10-30', '2026-10-31'], draft, dayRule);
    expect(totals.days).toBe(2);
    expect(totals.minutes).toBe(16 * 60);
    expect(totals.earnings).toBe(8 * 20 + 8 * 20 * 2);
  });

  it('falls back to a placeholder name for an empty shift name', () => {
    const [created] = buildBatchRecords(['2026-10-30'], { ...draft, shiftName: '  ' }, dayRule);
    expect(created.shiftName).toBe('补记班次');
  });
});
