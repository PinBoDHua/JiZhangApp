import { describe, expect, it } from 'vitest';
import {
  buildWeekOverview,
  monthDates,
  monthTotals,
  periodTotals,
  summarizeByDate,
  summarizePlansByDate,
} from './overview';
import type { PlannedShift, WorkRecord } from './types';

/** 8 小时班、休息 1 小时、时薪 20 → 净 7 小时 × 20 = 140 */
function record(date: string, overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id: `record-${date}-${overrides.start ?? '08:00'}`,
    date,
    templateId: null,
    shiftName: '白班',
    shiftColor: '#D08A2E',
    start: '08:00',
    end: '16:00',
    breakMinutes: 60,
    rate: 20,
    multiplier: 1,
    note: '',
    overtime: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function plan(date: string, overrides: Partial<PlannedShift> = {}): PlannedShift {
  return {
    id: `plan-${date}`,
    date,
    templateId: null,
    shiftName: '白班',
    shiftColor: '#D08A2E',
    start: '08:00',
    end: '16:00',
    breakMinutes: 60,
    rate: 20,
    multiplier: 1,
    note: '',
    overtime: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('summarizeByDate', () => {
  it('aggregates several records of the same day', () => {
    const totals = summarizeByDate([
      record('2026-10-26'),
      record('2026-10-26', { start: '18:00', end: '22:00', breakMinutes: 0 }),
    ]);
    const day = totals.get('2026-10-26');
    expect(day?.shifts).toBe(2);
    // 7h × 20 + 4h × 20
    expect(day?.earnings).toBeCloseTo(220, 2);
    expect(day?.minutes).toBe(11 * 60);
  });

  it('counts each record once even with overtime rules', () => {
    const totals = summarizeByDate([
      record('2026-10-26', {
        end: '18:00',
        breakMinutes: 0,
        overtime: { standardMinutes: 8 * 60, multiplier: 2 },
      }),
    ]);
    // 8h × 20 + 2h × 20 × 2
    expect(totals.get('2026-10-26')?.earnings).toBeCloseTo(240, 2);
    expect(totals.get('2026-10-26')?.shifts).toBe(1);
  });

  it('ignores the same record twice only when it is passed twice (no internal dedupe)', () => {
    const single = record('2026-10-26');
    expect(summarizeByDate([single]).get('2026-10-26')?.shifts).toBe(1);
  });
});

describe('periodTotals', () => {
  const totals = summarizeByDate([record('2026-10-26'), record('2026-10-27')]);

  it('only counts days that actually have records', () => {
    const summary = periodTotals(totals, ['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(summary).toEqual({ earnings: 280, minutes: 840, days: 2, shifts: 2 });
  });

  it('returns zeroes for an empty range', () => {
    expect(periodTotals(totals, ['2026-09-01'])).toEqual({
      earnings: 0,
      minutes: 0,
      days: 0,
      shifts: 0,
    });
  });
});

describe('monthTotals', () => {
  it('lists every day of the month, including leap February', () => {
    expect(monthDates(2026, 9)).toHaveLength(31);
    expect(monthDates(2024, 1)).toHaveLength(29);
    expect(monthDates(2026, 1)[0]).toBe('2026-02-01');
  });

  it('sums only the given month', () => {
    const totals = summarizeByDate([
      record('2026-09-30'),
      record('2026-10-01'),
      record('2026-10-31'),
    ]);
    expect(monthTotals(2026, 9, totals)).toEqual({
      earnings: 280,
      minutes: 840,
      days: 2,
      shifts: 2,
    });
  });
});

describe('buildWeekOverview', () => {
  // 2026-10-28 是周三；本周为 10-26 ~ 11-01，上周同期到 10-21（周三）
  const today = '2026-10-28';
  const totals = summarizeByDate([
    record('2026-10-26'),
    record('2026-10-27'),
    record('2026-10-19'),
    record('2026-10-22'),
  ]);

  it('aligns the previous week to the same weekday', () => {
    const week = buildWeekOverview(today, totals);
    expect(week.start).toBe('2026-10-26');
    expect(week.end).toBe('2026-11-01');
    expect(week.todayIndex).toBe(2);
    expect(week.current.earnings).toBe(280);
    // 上周四（10-22）在同期之后，不计入对比
    expect(week.previous.earnings).toBe(140);
    expect(week.difference).toBe(140);
  });

  it('builds seven points and the peak day', () => {
    const week = buildWeekOverview(today, totals);
    expect(week.points).toHaveLength(7);
    expect(week.points[0]).toMatchObject({ date: '2026-10-26', earnings: 140 });
    expect(week.points[6]).toMatchObject({ date: '2026-11-01', earnings: 0 });
    expect(week.maxDayEarnings).toBe(140);
    expect(week.hasData).toBe(true);
  });

  it('reports no data when both weeks are empty', () => {
    const week = buildWeekOverview(today, new Map());
    expect(week.hasData).toBe(false);
    expect(week.current.earnings).toBe(0);
    expect(week.maxDayEarnings).toBe(0);
  });

  it('keeps the same weekday cut-off when the week starts on another month', () => {
    // 2026-09-01 是周二，所在周从 8-31（周一）开始
    const week = buildWeekOverview('2026-09-01', totals);
    expect(week.start).toBe('2026-08-31');
    expect(week.todayIndex).toBe(1);
    expect(week.current.earnings).toBe(0);
    expect(week.previous.earnings).toBe(0);
  });
});

describe('summarizePlansByDate', () => {
  it('sums planned earnings per day', () => {
    const totals = summarizePlansByDate([
      plan('2026-10-26'),
      plan('2026-10-26', { start: '20:00', end: '23:00', breakMinutes: 0 }),
    ]);
    expect(totals.get('2026-10-26')?.shifts).toBe(2);
    expect(totals.get('2026-10-26')?.earnings).toBeCloseTo(200, 2);
  });
});
