import { describe, expect, it } from 'vitest';
import { validateShiftDraft } from './shiftDraft';

const base = {
  shiftName: '白班',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
};

describe('shift draft validation', () => {
  it('accepts a complete draft', () => {
    expect(validateShiftDraft(base)).toBe('');
    expect(validateShiftDraft({ ...base, start: '20:00', end: '08:00' })).toBe('');
  });

  it('reports problems in a stable order', () => {
    expect(validateShiftDraft({ ...base, shiftName: '   ' })).toBe('请填写班次名称');
    expect(validateShiftDraft({ ...base, end: '08:00' })).toBe('开始和结束时间不能相同');
    expect(validateShiftDraft({ ...base, breakMinutes: 600 })).toBe(
      '休息时长不能超过班次总时长',
    );
    expect(validateShiftDraft({ ...base, rate: -1 })).toBe('时薪不能为负数');
    expect(validateShiftDraft({ ...base, rate: Number.NaN })).toBe('时薪不能为负数');
  });

  it('reuses a precomputed total when given', () => {
    expect(validateShiftDraft(base, 540)).toBe('');
    expect(validateShiftDraft({ ...base, breakMinutes: 60 }, 60)).toBe(
      '休息时长不能超过班次总时长',
    );
  });

  it('validates an optional overtime rule', () => {
    expect(
      validateShiftDraft({
        ...base,
        overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
      }),
    ).toBe('');
    expect(
      validateShiftDraft({
        ...base,
        overtime: { standardMinutes: 0, multiplier: 1.5 },
      }),
    ).toBe('加班规则有误，请检查标准工时和加班倍数');
    expect(
      validateShiftDraft({
        ...base,
        overtime: { standardMinutes: 8 * 60, multiplier: 1 },
      }),
    ).toBe('加班规则有误，请检查标准工时和加班倍数');
  });
});
