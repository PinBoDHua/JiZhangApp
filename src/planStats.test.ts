import { describe, expect, it } from 'vitest';
import {
  buildPlanReconciliation,
  findMissedPlans,
  isPlanMissed,
  planEndMs,
  restorePendingPlan,
  toPlanHistoryEntry,
} from './planStats';
import type { PlanHistoryEntry, PlannedShift, WorkRecord } from './types';

const dayPlan: PlannedShift = {
  id: 'plan-day',
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
};

const nightPlan: PlannedShift = {
  ...dayPlan,
  id: 'plan-night',
  templateId: 'template-night',
  shiftName: '夜班',
  shiftColor: '#5563B8',
  start: '20:00',
  end: '08:00',
  rate: 30,
};

const makePlan = (overrides: Partial<PlannedShift>): PlannedShift => ({
  ...dayPlan,
  ...overrides,
});

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

const makeHistory = (overrides: Partial<PlanHistoryEntry>): PlanHistoryEntry => ({
  ...makePlan(overrides),
  status: 'completed',
  recordId: 'record-1',
  completedAt: 2,
  ...overrides,
});

describe('plan end and missed detection', () => {
  it('computes day and overnight end times', () => {
    expect(planEndMs(dayPlan)).toBe(new Date(2026, 9, 1, 17, 0, 0).getTime());
    expect(planEndMs(nightPlan)).toBe(new Date(2026, 9, 2, 8, 0, 0).getTime());
  });

  it('waits two hours after the shift end before marking a plan missed', () => {
    const beforeGrace = new Date(2026, 9, 1, 18, 59, 0);
    const afterGrace = new Date(2026, 9, 1, 19, 1, 0);
    expect(isPlanMissed(dayPlan, beforeGrace)).toBe(false);
    expect(isPlanMissed(dayPlan, afterGrace)).toBe(true);
  });

  it('does not mark the actively timed plan as missed', () => {
    const now = new Date(2026, 9, 2, 12, 0, 0);
    expect(isPlanMissed(dayPlan, now, dayPlan.id)).toBe(false);
  });

  it('finds missed plans oldest first and skips the active plan', () => {
    const now = new Date(2026, 9, 2, 12, 0, 0);
    const plans = [
      makePlan({ id: 'future', date: '2026-10-03' }),
      nightPlan,
      dayPlan,
    ];
    expect(findMissedPlans(plans, now).map((plan) => plan.id)).toEqual([
      'plan-day',
      'plan-night',
    ]);
    expect(findMissedPlans(plans, now, nightPlan.id).map((plan) => plan.id)).toEqual([
      'plan-day',
    ]);
  });
});

describe('plan reconciliation', () => {
  it('combines completed, skipped, missed, upcoming and actual records', () => {
    const now = new Date(2026, 9, 30, 12, 0, 0);
    const history = [
      makeHistory({ id: 'h1', date: '2026-10-01', recordId: 'r1' }),
      makeHistory({
        id: 'h2',
        date: '2026-10-02',
        status: 'skipped',
        recordId: null,
      }),
      makeHistory({ id: 'h3', date: '2026-10-04', recordId: 'missing-record' }),
      makeHistory({ id: 'h4', date: '2026-11-01', recordId: 'r1' }),
    ];
    const plans = [
      makePlan({ id: 'p1', date: '2026-10-03' }),
      makePlan({ id: 'p2', date: '2026-10-31' }),
      makePlan({ id: 'p3', date: '2026-10-30', start: '20:00', end: '08:00' }),
      makePlan({ id: 'p4', date: '2026-10-03' }),
      makePlan({ id: 'p5', date: '2026-11-01' }),
    ];
    const records = [
      makeRecord({ id: 'r1', date: '2026-10-01' }),
      makeRecord({ id: 'r2', date: '2026-10-05', rate: 25 }),
      makeRecord({ id: 'r3', date: '2026-11-01' }),
    ];

    const result = buildPlanReconciliation({
      plans,
      history,
      records,
      monthPrefix: '2026-10',
      now,
      activePlanId: 'p4',
    });

    expect(result.totalPlans).toBe(7);
    expect(result.due).toBe(4);
    expect(result.completed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.missed).toBe(2);
    expect(result.upcoming).toBe(3);
    expect(result.completionRate).toBe(0.25);
    expect(result.plannedDueMinutes).toBe(4 * 8 * 60);
    expect(result.plannedDueEarnings).toBe(4 * 160);
    expect(result.actualShifts).toBe(2);
    expect(result.actualMinutes).toBe(2 * 8 * 60);
    expect(result.actualEarnings).toBe(160 + 200);
    expect(result.diffShifts).toBe(-2);
    expect(result.diffMinutes).toBe(-16 * 60);
    expect(result.diffEarnings).toBe(-280);
  });

  it('returns no completion rate when nothing is due yet', () => {
    const result = buildPlanReconciliation({
      plans: [makePlan({ id: 'future', date: '2026-10-31' })],
      history: [],
      records: [],
      monthPrefix: '2026-10',
      now: new Date(2026, 9, 1, 12, 0, 0),
    });
    expect(result.totalPlans).toBe(1);
    expect(result.due).toBe(0);
    expect(result.upcoming).toBe(1);
    expect(result.completionRate).toBeNull();
    expect(result.plannedDueEarnings).toBe(0);
  });
});

describe('plan history conversion', () => {
  it('creates a completed history entry and restores the pending plan', () => {
    const plan = makePlan({
      id: 'plan-reminder',
      reminderEnabled: false,
      reminderLeadMinutes: 120,
    });
    const entry = toPlanHistoryEntry(plan, 'completed', 'record-9', 123);
    expect(entry).toMatchObject({
      id: 'plan-reminder',
      status: 'completed',
      recordId: 'record-9',
      completedAt: 123,
    });

    const restored = restorePendingPlan(entry);
    expect(restored).toEqual(plan);
    expect('status' in restored).toBe(false);
    expect('recordId' in restored).toBe(false);
  });
});
