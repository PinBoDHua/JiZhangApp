import { describe, expect, it } from 'vitest';
import {
  activePauseMs,
  activeWorkedMinutes,
  activeWorkedMs,
  addDaysISO,
  buildPayslipText,
  canStartPlan,
  formatDateCN,
  formatDateFullCN,
  formatDayHeading,
  formatDuration,
  formatElapsed,
  formatMoney,
  formatSignedCount,
  formatSignedDuration,
  formatSignedMoney,
  formatDateRangeCN,
  freePlanDates,
  getWeekRange,
  isPlanPast,
  rawMinutes,
  repeatDatesISO,
  settlementTotals,
  sortPlans,
  summarizeRecords,
  toCsv,
  workedMinutes,
} from './utils';
import type {
  ActiveShift,
  PlannedShift,
  SettlementAdjustment,
  WorkRecord,
} from './types';

const makeRecord = (overrides: Partial<WorkRecord>): WorkRecord => ({
  id: 'record-1',
  date: '2026-10-01',
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

const makePlan = (overrides: Partial<PlannedShift>): PlannedShift => ({
  id: 'plan-1',
  date: '2026-10-25',
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

const makeActive = (overrides: Partial<ActiveShift>): ActiveShift => ({
  templateId: 'template-day',
  sourcePlanId: null,
  shiftName: '白班',
  shiftColor: '#D08A2E',
  startDate: '2026-10-25',
  startTime: '08:00',
  startedAt: 1_000_000,
  pausedAt: null,
  pausedMs: 0,
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
  ...overrides,
});

describe('time calculations', () => {
  it('handles same-day and cross-midnight shifts', () => {
    expect(rawMinutes('08:00', '17:00')).toBe(540);
    expect(rawMinutes('20:00', '08:00')).toBe(720);
    expect(workedMinutes('20:00', '08:00', 60)).toBe(660);
  });

  it('returns zero for identical start and end times', () => {
    expect(rawMinutes('08:00', '08:00')).toBe(0);
    expect(workedMinutes('08:00', '08:00', 0)).toBe(0);
  });

  it('ignores an invalid break length instead of returning NaN', () => {
    expect(workedMinutes('08:00', '17:00', Number.NaN)).toBe(540);
    expect(workedMinutes('08:00', '17:00', -30)).toBe(540);
  });
});

describe('date formatting resilience', () => {
  it('keeps the raw string instead of printing NaN dates', () => {
    expect(formatDateCN('2026-13-45')).toBe('2026-13-45');
    expect(formatDateFullCN('not-a-date')).toBe('not-a-date');
    expect(formatDayHeading('')).toBe('');
  });

  it('does not shift an unparseable date by a day', () => {
    expect(addDaysISO('broken', 1)).toBe('broken');
  });

  it('falls back to the current week when the anchor is invalid', () => {
    const week = getWeekRange('2026-13-45');
    expect(week.start <= week.end).toBe(true);
    expect(week.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('duration formatting', () => {
  it('never renders a dangling 60 minutes', () => {
    expect(formatDuration(59.6)).toBe('1 小时');
    expect(formatDuration(119.6)).toBe('2 小时');
    expect(formatDuration(0)).toBe('0 小时');
    expect(formatDuration(125)).toBe('2 小时 5 分');
    expect(formatDuration(Number.NaN)).toBe('0 小时');
  });
});

describe('money formatting', () => {
  it('keeps two decimals only when needed', () => {
    expect(formatMoney(1000)).toBe('1,000');
    expect(formatMoney(1234.5)).toBe('1,234.50');
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(-0.001)).toBe('0');
    expect(formatMoney(Number.NaN)).toBe('0');
  });

  it('formats signed differences with a single sign and unit', () => {
    expect(formatSignedMoney(120)).toBe('+¥120');
    expect(formatSignedMoney(-120.456)).toBe('-¥120.46');
    expect(formatSignedMoney(0)).toBe('¥0');
    expect(formatSignedMoney(Number.NaN)).toBe('¥0');
    expect(formatSignedCount(3)).toBe('+3');
    expect(formatSignedCount(-3)).toBe('-3');
    expect(formatSignedCount(0)).toBe('0');
    expect(formatSignedDuration(90)).toBe('+1 小时 30 分');
    expect(formatSignedDuration(-90)).toBe('-1 小时 30 分');
    expect(formatSignedDuration(0)).toBe('0 小时');
  });
});

describe('shift plans', () => {
  it('repeats weekly dates and clamps the number of weeks', () => {
    expect(repeatDatesISO('2026-10-25', 4)).toEqual([
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
    ]);
    expect(repeatDatesISO('2026-12-28', 2)).toEqual(['2026-12-28', '2027-01-04']);
    expect(repeatDatesISO('2026-10-25', 0)).toEqual(['2026-10-25']);
    expect(repeatDatesISO('2026-10-25', 99)).toHaveLength(52);
  });

  it('marks same-day plans past only after their end time', () => {
    const plan = makePlan({});
    expect(isPlanPast(plan, new Date(2026, 9, 25, 7, 0))).toBe(false);
    expect(isPlanPast(plan, new Date(2026, 9, 25, 16, 59))).toBe(false);
    expect(isPlanPast(plan, new Date(2026, 9, 25, 17, 1))).toBe(true);
    expect(isPlanPast(makePlan({ date: '2026-10-24' }), new Date(2026, 9, 25, 7, 0))).toBe(true);
    expect(isPlanPast(plan, new Date(2026, 9, 24, 23, 0))).toBe(false);
    expect(
      isPlanPast(makePlan({ date: '2026-10-26' }), new Date(2026, 9, 25, 23, 59)),
    ).toBe(false);
  });

  it('keeps overnight plans alive until the next morning', () => {
    const plan = makePlan({ start: '20:00', end: '08:00', breakMinutes: 60 });
    expect(isPlanPast(plan, new Date(2026, 9, 25, 19, 0))).toBe(false);
    expect(isPlanPast(plan, new Date(2026, 9, 26, 2, 0))).toBe(false);
    expect(isPlanPast(plan, new Date(2026, 9, 26, 8, 1))).toBe(true);
    expect(
      isPlanPast(
        makePlan({ date: '2026-10-23', start: '20:00', end: '08:00' }),
        new Date(2026, 9, 24, 9, 0),
      ),
    ).toBe(true);
  });

  it('only allows clock-in on the plan day or an overnight carry-over', () => {
    const plan = makePlan({});
    expect(canStartPlan(plan, new Date(2026, 9, 25, 7, 0))).toBe(true);
    expect(canStartPlan(plan, new Date(2026, 9, 26, 7, 0))).toBe(false);
    expect(canStartPlan(plan, new Date(2026, 9, 25, 18, 0))).toBe(false);

    const overnight = makePlan({ start: '20:00', end: '08:00' });
    expect(canStartPlan(overnight, new Date(2026, 9, 26, 2, 0))).toBe(true);
    expect(canStartPlan(overnight, new Date(2026, 9, 26, 8, 1))).toBe(false);
    expect(
      canStartPlan(
        makePlan({ date: '2026-10-27', start: '20:00', end: '08:00' }),
        new Date(2026, 9, 26, 23, 0),
      ),
    ).toBe(false);
  });

  it('sorts plans by date and start time', () => {
    const plans = [
      makePlan({ id: 'c', date: '2026-10-26', start: '08:00' }),
      makePlan({ id: 'a', date: '2026-10-25', start: '20:00' }),
      makePlan({ id: 'b', date: '2026-10-25', start: '08:00' }),
    ];
    expect(sortPlans(plans).map((plan) => plan.id)).toEqual(['b', 'a', 'c']);
  });

  it('drops repeat dates that already have a plan', () => {
    const dates = repeatDatesISO('2026-10-25', 4);
    const plans = [makePlan({ date: '2026-11-01' }), makePlan({ date: '2026-11-15' })];
    expect(freePlanDates(dates, plans)).toEqual(['2026-10-25', '2026-11-08']);
    expect(freePlanDates(dates, [])).toEqual(dates);
  });
});

describe('week ranges', () => {
  it('starts on Monday and ends on Sunday', () => {
    expect(getWeekRange('2026-10-25')).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
    });
  });

  it('handles weeks crossing a year boundary', () => {
    expect(getWeekRange('2026-01-01')).toEqual({
      start: '2025-12-29',
      end: '2026-01-04',
    });
  });

  it('formats a range across months', () => {
    expect(formatDateRangeCN('2026-09-28', '2026-10-04')).toBe('9月28日 – 10月4日');
  });
});

describe('active shift pauses', () => {
  it('subtracts completed pauses from worked time', () => {
    const shift = makeActive({ pausedMs: 30 * 60_000 });
    const now = shift.startedAt + 3 * 60 * 60_000;
    expect(activePauseMs(shift, now)).toBe(30 * 60_000);
    expect(activeWorkedMs(shift, now)).toBe(150 * 60_000);
    expect(activeWorkedMinutes(shift, now)).toBe(150);
  });

  it('includes an ongoing pause and freezes worked time', () => {
    const now = 1_000_000 + 3 * 60 * 60_000;
    const shift = makeActive({
      pausedMs: 30 * 60_000,
      pausedAt: now - 15 * 60_000,
    });
    expect(activePauseMs(shift, now)).toBe(45 * 60_000);
    expect(activeWorkedMinutes(shift, now)).toBe(135);
  });

  it('never returns negative worked time', () => {
    const shift = makeActive({ startedAt: 5_000, pausedAt: 4_000 });
    expect(activeWorkedMs(shift, 3_000)).toBe(0);
  });

  it('formats short and long elapsed durations', () => {
    expect(formatElapsed(0)).toBe('不到 1 分钟');
    expect(formatElapsed(45)).toBe('45 分钟');
    expect(formatElapsed(125)).toBe('2 小时 5 分');
  });
});

describe('record summaries', () => {
  it('aggregates hours, earnings, days and shifts', () => {
    const day = makeRecord({});
    const night = makeRecord({
      id: 'record-2',
      date: '2026-10-02',
      shiftName: '夜班',
      start: '20:00',
      end: '08:00',
      rate: 30,
    });
    const summary = summarizeRecords([day, night]);
    expect(summary.minutes).toBe(1140);
    expect(summary.earnings).toBe(490);
    expect(summary.days).toBe(2);
    expect(summary.shifts).toBe(2);
    expect(summary.averageRate).toBeCloseTo(490 / 19);
    expect(summary.regularMinutes).toBe(1140);
    expect(summary.overtimeMinutes).toBe(0);
    expect(summary.overtimeEarnings).toBe(0);
  });

  it('separates overtime hours and pay in summaries', () => {
    const longDay = makeRecord({
      start: '08:00',
      end: '20:00',
      breakMinutes: 60,
      rate: 20,
      overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
    });
    const summary = summarizeRecords([longDay]);
    expect(summary.minutes).toBe(660);
    expect(summary.regularMinutes).toBe(480);
    expect(summary.overtimeMinutes).toBe(180);
    expect(summary.regularMinutes + summary.overtimeMinutes).toBe(summary.minutes);
    expect(summary.earnings).toBe(250);
    expect(summary.overtimeEarnings).toBe(90);
  });

  it('handles an empty period', () => {
    expect(summarizeRecords([])).toEqual({
      minutes: 0,
      earnings: 0,
      days: 0,
      shifts: 0,
      averageRate: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      overtimeEarnings: 0,
    });
  });
});

describe('CSV export', () => {
  it('includes regular and overtime columns', () => {
    const csv = toCsv([
      makeRecord({
        start: '08:00',
        end: '19:00',
        breakMinutes: 60,
        rate: 20,
        overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
        note: '加班',
      }),
    ]);
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('"加班工时(小时)"');
    expect(header).toContain('"加班倍数"');
    expect(row).toContain('"8.00"');
    expect(row).toContain('"2.00"');
    expect(row).toContain('"1.5"');
    expect(row).toContain('"220.00"');
    expect(row).toContain('"加班"');
  });
});

describe('settlement totals and payslips', () => {
  const adjustments: SettlementAdjustment[] = [
    { id: 'a', kind: 'bonus', label: '全勤奖', amount: 200 },
    { id: 'b', kind: 'deduction', label: '迟到', amount: 50 },
    { id: 'c', kind: 'advance', label: '预支', amount: 1000 },
  ];

  it('calculates bonuses, deductions, advances and net due', () => {
    expect(settlementTotals(3350, adjustments)).toEqual({
      bonus: 200,
      deduction: 50,
      advance: 1000,
      adjustmentTotal: -850,
      netDue: 2500,
    });
  });

  it('builds a payslip with adjustments and a paid difference', () => {
    const totals = settlementTotals(3350, adjustments);
    const text = buildPayslipText({
      monthLabel: '2026年10月',
      minutes: 6840,
      days: 11,
      baseEarnings: 3350,
      adjustments,
      totals,
      status: 'paid',
      paidAt: '2026-11-15',
      paidAmount: 2450,
      note: '下月补发',
    });
    expect(text).toContain('工时账本 · 2026年10月 工资条');
    expect(text).toContain('全勤奖：+¥200');
    expect(text).toContain('迟到：-¥50');
    expect(text).toContain('预支：-¥1,000');
    expect(text).toContain('应发：¥2,500');
    expect(text).toContain('实发：¥2,450');
    expect(text).toContain('差额：-¥50');
    expect(text).toContain('备注：下月补发');
  });

  it('builds a pending payslip without paid fields', () => {
    const totals = settlementTotals(1000, []);
    const text = buildPayslipText({
      monthLabel: '2026年9月',
      minutes: 3600,
      days: 5,
      baseEarnings: 1000,
      adjustments: [],
      totals,
      status: 'pending',
      paidAt: null,
      paidAmount: null,
      note: '',
    });
    expect(text).toContain('应发：¥1,000');
    expect(text).toContain('状态：待到账');
    expect(text).not.toContain('实发：');
  });

  it('adds an overtime line to payslips when the month has overtime', () => {
    const totals = settlementTotals(2500, []);
    const text = buildPayslipText({
      monthLabel: '2026年10月',
      minutes: 7200,
      days: 15,
      baseEarnings: 2500,
      adjustments: [],
      totals,
      status: 'pending',
      paidAt: null,
      paidAmount: null,
      note: '',
      overtimeMinutes: 300,
      overtimeEarnings: 150,
    });
    expect(text).toContain('工时收入：¥2,500');
    expect(text).toContain('其中加班：5 小时 · ¥150');
    expect(text).toContain('应发：¥2,500');
  });
});
