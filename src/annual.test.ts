import { describe, expect, it } from 'vitest';
import {
  buildAnnualDays,
  buildAnnualReportText,
  buildAnnualSummary,
  buildYearHeatmap,
  daysInYear,
} from './annual';
import type { WorkRecord } from './types';

const makeRecord = (overrides: Partial<WorkRecord>): WorkRecord => ({
  id: 'record-1',
  date: '2026-01-01',
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
  ...overrides,
});

const records: WorkRecord[] = [
  makeRecord({ id: 'a', date: '2025-12-31' }),
  makeRecord({ id: 'b', date: '2026-01-01' }),
  makeRecord({ id: 'c', date: '2026-01-02' }),
  makeRecord({ id: 'd', date: '2026-01-03' }),
  makeRecord({ id: 'e', date: '2026-01-05' }),
  makeRecord({ id: 'f', date: '2026-01-06' }),
  makeRecord({
    id: 'g',
    date: '2026-02-10',
    shiftName: '夜班',
    shiftColor: '#5563B8',
    start: '20:00',
    end: '08:00',
    breakMinutes: 60,
    overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
  }),
];

describe('annual review', () => {
  it('counts days in leap and common years', () => {
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
    expect(daysInYear(1900)).toBe(365);
  });

  it('summarizes a year by earnings, days, overtime and streaks', () => {
    const summary = buildAnnualSummary(records, 2026);
    expect(summary.shifts).toBe(6);
    expect(summary.days).toBe(6);
    expect(summary.earnings).toBe(1050);
    expect(summary.minutes).toBe(3060);
    expect(summary.averageRate).toBeCloseTo(20.59, 2);
    expect(summary.overtimeMinutes).toBe(180);
    expect(summary.overtimeEarnings).toBe(90);
    expect(summary.activeMonths).toBe(2);
    expect(summary.longestStreak).toBe(3);
    expect(summary.bestMonth).toMatchObject({ month: 1, earnings: 800, days: 5 });
    expect(summary.bestDay).toMatchObject({ date: '2026-02-10', earnings: 250 });
    expect(summary.topShift).toMatchObject({ name: '白班', count: 5, earnings: 800 });
  });

  it('builds a full-year day list and a padded 12 × 31 heatmap', () => {
    const days = buildAnnualDays(records, 2026);
    expect(days).toHaveLength(365);
    expect(days[0]).toMatchObject({ date: '2026-01-01', earnings: 160, shifts: 1 });
    expect(days[364].date).toBe('2026-12-31');

    const heatmap = buildYearHeatmap(records, 2026);
    expect(heatmap).toHaveLength(12);
    heatmap.forEach((row) => expect(row).toHaveLength(31));
    expect(heatmap[0][0]).toMatchObject({ date: '2026-01-01', earnings: 160 });
    expect(heatmap[1][9]).toMatchObject({ date: '2026-02-10', overtimeMinutes: 180 });
    expect(heatmap[1][27]).not.toBeNull();
    expect(heatmap[1][28]).toBeNull();
    expect(heatmap[3][30]).toBeNull();
    expect(heatmap[0][30]).not.toBeNull();
  });

  it('produces a shareable report with the important figures', () => {
    const summary = buildAnnualSummary(records, 2026);
    const text = buildAnnualReportText(summary);
    expect(text).toContain('工时账本 · 2026 年度复盘');
    expect(text).toContain('总收入：¥1,050');
    expect(text).toContain('总工时：51 小时');
    expect(text).toContain('出勤：6 天 · 6 班');
    expect(text).toContain('平均时薪：¥20.59');
    expect(text).toContain('加班：3 小时 · ¥90');
    expect(text).toContain('最高收入月：1月 · ¥800');
    expect(text).toContain('最高单日：2月10日 · 周二 · ¥250');
    expect(text).toContain('最长连续出勤：3 天');
    expect(text).toContain('最常上的班次：白班（5 班）');
    expect(text).toContain('覆盖月份：2 个月');
  });

  it('handles an empty year', () => {
    const summary = buildAnnualSummary(records, 2020);
    expect(summary).toMatchObject({
      year: 2020,
      earnings: 0,
      minutes: 0,
      days: 0,
      shifts: 0,
      averageRate: 0,
      overtimeMinutes: 0,
      activeMonths: 0,
      bestMonth: null,
      bestDay: null,
      longestStreak: 0,
      topShift: null,
    });
    expect(buildAnnualReportText(summary)).toContain('今年还没有记录');
    expect(buildYearHeatmap(records, 2020).every((row) => row.every((day) => day === null || day.earnings === 0))).toBe(true);
  });
});
