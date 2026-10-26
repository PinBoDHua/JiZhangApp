import { describe, expect, it } from 'vitest';
import {
  buildReminderCandidates,
  buildReminderContent,
  normalizeReminderLead,
  planStartMs,
  reminderIdForPlan,
} from './reminders';
import type { PlannedShift } from './types';

const makePlan = (overrides: Partial<PlannedShift>): PlannedShift => ({
  id: 'plan-1',
  date: '2026-10-26',
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

describe('buildReminderCandidates', () => {
  const now = new Date(2026, 9, 25, 12, 0, 0).getTime();

  it('only keeps future reminders sorted by trigger time', () => {
    const plans = [
      makePlan({ id: 'later', date: '2026-10-27' }),
      makePlan({ id: 'soon', date: '2026-10-26', start: '08:00' }),
      makePlan({ id: 'past', date: '2026-10-25', start: '09:00' }),
    ];
    const candidates = buildReminderCandidates(plans, now, 60);
    expect(candidates.map((candidate) => candidate.plan.id)).toEqual(['soon', 'later']);
    expect(candidates[0].notifyAt).toBe(planStartMs(plans[1]) - 60 * 60_000);
  });

  it('drops reminders whose lead time already passed', () => {
    const plans = [makePlan({ date: '2026-10-25', start: '12:30' })];
    expect(buildReminderCandidates(plans, now, 60)).toEqual([]);
  });

  it('limits the number of scheduled reminders', () => {
    const plans = Array.from({ length: 10 }, (_, index) =>
      makePlan({ id: `plan-${index}`, date: `2026-11-${String(index + 1).padStart(2, '0')}` }),
    );
    expect(buildReminderCandidates(plans, now, 60, 3)).toHaveLength(3);
  });

  it('supports per-plan lead time and opt-out', () => {
    const customLead = makePlan({
      id: 'custom-lead',
      date: '2026-10-26',
      reminderLeadMinutes: 30,
    });
    const disabled = makePlan({
      id: 'disabled',
      date: '2026-10-26',
      reminderEnabled: false,
    });
    const followGlobal = makePlan({
      id: 'follow-global',
      date: '2026-10-27',
      reminderLeadMinutes: null,
    });
    const candidates = buildReminderCandidates(
      [customLead, disabled, followGlobal],
      now,
      120,
    );
    expect(candidates.map((candidate) => candidate.plan.id)).toEqual([
      'custom-lead',
      'follow-global',
    ]);
    expect(candidates[0].leadMinutes).toBe(30);
    expect(candidates[0].notifyAt).toBe(planStartMs(customLead) - 30 * 60_000);
    expect(candidates[1].leadMinutes).toBe(120);
  });
});

describe('reminder content', () => {
  it('labels today and tomorrow relative to the trigger time', () => {
    const todayPlan = makePlan({
      date: '2026-10-26',
      templateId: 'template-night',
      shiftName: '夜班',
      shiftColor: '#5563B8',
      start: '20:00',
      end: '08:00',
      rate: 30,
    });
    const todayNotify = new Date(2026, 9, 26, 19, 0, 0).getTime();
    expect(buildReminderContent(todayPlan, todayNotify, 60).title).toBe('1 小时后上班');
    expect(buildReminderContent(todayPlan, todayNotify, 60).body).toContain('今天 夜班');

    const tomorrowNotify = new Date(2026, 9, 25, 20, 0, 0).getTime();
    const tomorrow = buildReminderContent(todayPlan, tomorrowNotify, 720);
    expect(tomorrow.title).toBe('12 小时后上班');
    expect(tomorrow.body).toContain('明天');
  });
});

describe('reminder helpers', () => {
  it('normalizes unsupported lead options to the default', () => {
    expect(normalizeReminderLead(120)).toBe(120);
    expect(normalizeReminderLead(45)).toBe(60);
  });

  it('creates stable positive 32-bit notification ids', () => {
    const first = reminderIdForPlan('6f0e2b3a-1c65-4f6a-8be0-3e7da2b5a6c1');
    expect(first).toBe(reminderIdForPlan('6f0e2b3a-1c65-4f6a-8be0-3e7da2b5a6c1'));
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(2_147_483_647);
    expect(reminderIdForPlan('another-plan')).not.toBe(first);
  });
});
