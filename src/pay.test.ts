import { describe, expect, it } from 'vitest';
import {
  computePay,
  DEFAULT_OVERTIME_MULTIPLIER,
  DEFAULT_STANDARD_MINUTES,
  isValidOvertimeRule,
  normalizeOvertimeRule,
} from './pay';

describe('segmented pay', () => {
  it('falls back to a single multiplier when no overtime rule is set', () => {
    expect(
      computePay({ minutes: 8 * 60, rate: 20, multiplier: 1.5 }),
    ).toEqual({
      minutes: 480,
      regularMinutes: 480,
      overtimeMinutes: 0,
      regularPay: 240,
      overtimePay: 0,
      total: 240,
      effectiveRate: 30,
      overtime: null,
    });
  });

  it('splits a long shift into regular and overtime segments', () => {
    const pay = computePay({
      minutes: 11 * 60,
      rate: 20,
      multiplier: 1,
      overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
    });
    expect(pay.regularMinutes).toBe(480);
    expect(pay.overtimeMinutes).toBe(180);
    expect(pay.regularPay).toBe(160);
    expect(pay.overtimePay).toBe(90);
    expect(pay.total).toBe(250);
    expect(pay.effectiveRate).toBeCloseTo(22.73, 2);
    expect(pay.overtime?.multiplier).toBe(1.5);
  });

  it('keeps a short shift entirely regular', () => {
    const pay = computePay({
      minutes: 6 * 60,
      rate: 25,
      multiplier: 1,
      overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
    });
    expect(pay.overtimeMinutes).toBe(0);
    expect(pay.overtimePay).toBe(0);
    expect(pay.total).toBe(150);
  });

  it('never pays overtime below the normal shift multiplier', () => {
    const pay = computePay({
      minutes: 10 * 60,
      rate: 20,
      multiplier: 2,
      overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
    });
    expect(pay.regularPay).toBe(320);
    expect(pay.overtimePay).toBe(80);
    expect(pay.total).toBe(400);
    expect(pay.overtime?.multiplier).toBe(2);
  });

  it('rounds each segment to cents and keeps the total consistent', () => {
    const pay = computePay({
      minutes: 7 * 60 + 25,
      rate: 19.5,
      multiplier: 1,
      overtime: { standardMinutes: 7 * 60, multiplier: 1.5 },
    });
    expect(pay.regularPay).toBe(136.5);
    expect(pay.overtimePay).toBe(12.19);
    expect(pay.total).toBe(148.69);
  });

  it('ignores invalid overtime rules instead of producing NaN', () => {
    expect(
      computePay({
        minutes: 600,
        rate: 20,
        multiplier: 1,
        overtime: { standardMinutes: 0, multiplier: 1.5 },
      }).total,
    ).toBe(200);
    expect(
      computePay({
        minutes: 600,
        rate: 20,
        multiplier: 1,
        overtime: { standardMinutes: 480, multiplier: 1 },
      }).total,
    ).toBe(200);
    expect(
      computePay({
        minutes: Number.NaN,
        rate: Number.NaN,
        multiplier: Number.NaN,
      }),
    ).toMatchObject({ minutes: 0, total: 0, effectiveRate: 0 });
  });

  it('normalizes and validates rules from stored data', () => {
    expect(normalizeOvertimeRule({ standardMinutes: 480.4, multiplier: 1.5 })).toEqual({
      standardMinutes: 480,
      multiplier: 1.5,
    });
    expect(normalizeOvertimeRule(null)).toBeNull();
    expect(normalizeOvertimeRule({ standardMinutes: -1, multiplier: 1.5 })).toBeNull();
    expect(normalizeOvertimeRule({ standardMinutes: 480, multiplier: 0.5 })).toBeNull();
    expect(isValidOvertimeRule({ standardMinutes: 480, multiplier: 1.5 })).toBe(true);
    expect(isValidOvertimeRule({ standardMinutes: 480, multiplier: 11 })).toBe(false);
    expect(isValidOvertimeRule({ standardMinutes: 1441, multiplier: 1.5 })).toBe(false);
    expect(DEFAULT_STANDARD_MINUTES).toBe(480);
    expect(DEFAULT_OVERTIME_MULTIPLIER).toBe(1.5);
  });
});
