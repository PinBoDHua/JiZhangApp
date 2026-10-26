import { describe, expect, it } from 'vitest';
import { buildMonthForecast } from './forecast';
import type { PlannedShift, WorkRecord } from './types';

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
  date: '2026-10-20',
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

const now = new Date(2026, 9, 15, 12, 0);

describe('monthly income forecast', () => {
  const records = [
    makeRecord({ id: 'r1', date: '2026-10-01' }),
    makeRecord({ id: 'r2', date: '2026-09-30', rate: 20 }),
  ];
  const plans = [
    makePlan({ id: 'past', date: '2026-10-10' }),
    makePlan({ id: 'next', date: '2026-10-20' }),
    makePlan({
      id: 'long',
      date: '2026-10-21',
      end: '19:00',
      overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
    }),
    makePlan({ id: 'other-month', date: '2026-11-01' }),
  ];

  it('adds upcoming plans to recorded earnings and ignores past plans', () => {
    const forecast = buildMonthForecast({
      records,
      plans,
      monthPrefix: '2026-10',
      now,
    });
    expect(forecast.recordedShifts).toBe(1);
    expect(forecast.recordedEarnings).toBe(160);
    expect(forecast.upcomingPlans).toBe(2);
    expect(forecast.upcomingMinutes).toBe(480 + 600);
    expect(forecast.upcomingEarnings).toBe(160 + 220);
    expect(forecast.upcomingDays).toBe(2);
    expect(forecast.projectedEarnings).toBe(540);
    expect(forecast.projectedMinutes).toBe(1560);
  });

  it('tracks goal progress from recorded and projected earnings', () => {
    const forecast = buildMonthForecast({
      records,
      plans,
      monthPrefix: '2026-10',
      now,
      goal: 1000,
    });
    expect(forecast.recordedPercent).toBe(16);
    expect(forecast.projectedPercent).toBe(54);
    expect(forecast.remainingToGoal).toBe(840);
    expect(forecast.projectedRemaining).toBe(460);
    expect(forecast.averageUpcomingEarning).toBe(190);
    expect(forecast.shiftsToGoal).toBe(3);
  });

  it('reports zero shifts needed once projected income reaches the goal', () => {
    const forecast = buildMonthForecast({
      records,
      plans,
      monthPrefix: '2026-10',
      now,
      goal: 500,
    });
    expect(forecast.projectedPercent).toBe(108);
    expect(forecast.projectedRemaining).toBe(0);
    expect(forecast.shiftsToGoal).toBe(0);
  });

  it('returns no goal metrics when no goal is set', () => {
    const forecast = buildMonthForecast({
      records,
      plans,
      monthPrefix: '2026-10',
      now,
    });
    expect(forecast.goal).toBe(0);
    expect(forecast.recordedPercent).toBeNull();
    expect(forecast.projectedPercent).toBeNull();
    expect(forecast.shiftsToGoal).toBeNull();
  });

  it('handles future and past months', () => {
    const future = buildMonthForecast({
      records,
      plans,
      monthPrefix: '2026-11',
      now,
    });
    expect(future.recordedShifts).toBe(0);
    expect(future.upcomingPlans).toBe(1);
    expect(future.projectedEarnings).toBe(160);

    const past = buildMonthForecast({
      records,
      plans,
      monthPrefix: '2026-09',
      now,
    });
    expect(past.recordedEarnings).toBe(160);
    expect(past.upcomingPlans).toBe(0);
    expect(past.projectedEarnings).toBe(160);
  });

  it('counts a plan that is still running right now', () => {
    const running = makePlan({
      id: 'running',
      date: '2026-10-15',
      start: '08:00',
      end: '17:00',
    });
    const forecast = buildMonthForecast({
      records: [],
      plans: [running],
      monthPrefix: '2026-10',
      now,
    });
    expect(forecast.upcomingPlans).toBe(1);
    expect(forecast.projectedEarnings).toBe(160);
  });

  it('does not project a plan that already ended today', () => {
    const ended = makePlan({
      id: 'ended',
      date: '2026-10-15',
      start: '08:00',
      end: '11:00',
    });
    const forecast = buildMonthForecast({
      records: [],
      plans: [ended],
      monthPrefix: '2026-10',
      now,
    });
    expect(forecast.upcomingPlans).toBe(0);
    expect(forecast.projectedEarnings).toBe(0);
  });
});
