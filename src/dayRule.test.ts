import { describe, expect, it } from 'vitest';
import {
  DAY_MULTIPLIER_OPTIONS,
  describeDayRule,
  formatMultiplier,
  isHolidayDateISO,
  normalizeDayPayRule,
  removeHoliday,
  resolveDayRule,
  upsertHoliday,
} from './dayRule';
import { DEFAULT_DAY_PAY_RULE } from './types';

const enabled = {
  ...DEFAULT_DAY_PAY_RULE,
  enabled: true,
};

describe('day pay rule', () => {
  it('keeps every day at 1x when the rule is off', () => {
    expect(resolveDayRule(DEFAULT_DAY_PAY_RULE, '2026-10-31')).toEqual({
      multiplier: 1,
      kind: 'workday',
      label: '',
    });
    expect(describeDayRule(DEFAULT_DAY_PAY_RULE, '2026-10-31')).toBe('');
  });

  it('uses the weekend multiplier on Saturday and Sunday only', () => {
    const rule = { ...enabled, weekendMultiplier: 1.5, holidayMultiplier: 3 };
    expect(resolveDayRule(rule, '2026-10-31')).toEqual({
      multiplier: 1.5,
      kind: 'weekend',
      label: '周六',
    });
    expect(resolveDayRule(rule, '2026-11-01')).toEqual({
      multiplier: 1.5,
      kind: 'weekend',
      label: '周日',
    });
    expect(resolveDayRule(rule, '2026-10-28').multiplier).toBe(1);
    expect(resolveDayRule(rule, '2026-10-28').kind).toBe('workday');
  });

  it('lets a holiday override the weekend multiplier', () => {
    const rule = upsertHoliday(
      { ...enabled, weekendMultiplier: 2, holidayMultiplier: 3 },
      { date: '2026-10-31', label: '调休上班' },
    );
    expect(resolveDayRule(rule, '2026-10-31')).toEqual({
      multiplier: 3,
      kind: 'holiday',
      label: '调休上班',
    });
    expect(describeDayRule(rule, '2026-10-31')).toBe('调休上班 · 3×');
  });

  it('normalizes broken stored values instead of producing NaN', () => {
    const rule = normalizeDayPayRule({
      enabled: true,
      weekendMultiplier: Number.NaN,
      holidayMultiplier: -2,
      holidays: [
        { date: '2026-02-30', label: '不存在的日期' },
        { date: '2026-10-01', label: '  国庆节  ' },
        { date: '2026-10-01', label: '国庆' },
        { date: 'bad', label: 'x' },
      ] as never,
    });
    expect(rule.weekendMultiplier).toBe(DEFAULT_DAY_PAY_RULE.weekendMultiplier);
    expect(rule.holidayMultiplier).toBe(DEFAULT_DAY_PAY_RULE.holidayMultiplier);
    expect(rule.holidays).toEqual([{ date: '2026-10-01', label: '国庆' }]);
  });

  it('rejects impossible dates and clamps long labels', () => {
    expect(isHolidayDateISO('2026-10-31')).toBe(true);
    expect(isHolidayDateISO('2026-02-30')).toBe(false);
    expect(isHolidayDateISO('2026-1-1')).toBe(false);
    expect(isHolidayDateISO(20261031)).toBe(false);
    const rule = upsertHoliday(enabled, {
      date: '2026-10-01',
      label: '国庆节连休第一天',
    });
    expect(rule.holidays[0].label.length).toBeLessThanOrEqual(12);
  });

  it('removes a holiday without touching the other entries', () => {
    const rule = upsertHoliday(
      upsertHoliday(enabled, { date: '2026-10-01', label: '国庆' }),
      { date: '2026-10-02', label: '国庆' },
    );
    expect(rule.holidays).toHaveLength(2);
    expect(removeHoliday(rule, '2026-10-01').holidays).toEqual([
      { date: '2026-10-02', label: '国庆' },
    ]);
  });

  it('formats multipliers without trailing zeros', () => {
    expect(formatMultiplier(1)).toBe('1');
    expect(formatMultiplier(1.5)).toBe('1.5');
    expect(formatMultiplier(1.25)).toBe('1.25');
    expect(DAY_MULTIPLIER_OPTIONS).toContain(1.75);
  });
});
