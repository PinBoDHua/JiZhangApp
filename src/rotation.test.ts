import { describe, expect, it } from 'vitest';
import { buildRotationPreview, cycleRotationDays, getRotationPresets } from './rotation';
import type { PlannedShift, ShiftTemplate } from './types';

const dayTemplate: ShiftTemplate = {
  id: 'template-day',
  name: '白班',
  color: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
};

const nightTemplate: ShiftTemplate = {
  id: 'template-night',
  name: '夜班',
  color: '#5563B8',
  start: '20:00',
  end: '08:00',
  breakMinutes: 60,
  rate: 30,
};

const makePlan = (overrides: Partial<PlannedShift>): PlannedShift => ({
  id: 'plan-1',
  date: '2026-10-26',
  templateId: dayTemplate.id,
  shiftName: dayTemplate.name,
  shiftColor: dayTemplate.color,
  start: dayTemplate.start,
  end: dayTemplate.end,
  breakMinutes: dayTemplate.breakMinutes,
  rate: dayTemplate.rate,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('rotation presets', () => {
  it('builds presets from day and night templates', () => {
    const presets = getRotationPresets([nightTemplate, dayTemplate]);
    expect(presets.map((preset) => preset.name)).toEqual([
      '白/夜/休',
      '白/白/夜/夜/休/休',
      '白/夜/休/休',
    ]);
    expect(presets[0].cycle).toEqual([dayTemplate.id, nightTemplate.id, null]);
  });

  it('returns no presets when only one template exists', () => {
    expect(getRotationPresets([dayTemplate])).toEqual([]);
  });
});

describe('cycleRotationDays', () => {
  it('repeats the cycle from the start date', () => {
    const days = cycleRotationDays('2026-10-25', 1, [
      dayTemplate.id,
      nightTemplate.id,
      null,
    ]);
    expect(days).toHaveLength(7);
    expect(days.map((day) => day.templateId)).toEqual([
      dayTemplate.id,
      nightTemplate.id,
      null,
      dayTemplate.id,
      nightTemplate.id,
      null,
      dayTemplate.id,
    ]);
    expect(days[6].date).toBe('2026-10-31');
  });

  it('caps the cycle length at 28 days', () => {
    const cycle = Array.from({ length: 30 }, (_, index) =>
      index < 28 ? dayTemplate.id : null,
    );
    const days = cycleRotationDays('2026-10-01', 5, cycle);
    expect(days[28].templateId).toBe(dayTemplate.id);
    expect(days[29].templateId).toBe(dayTemplate.id);
    expect(days[30].templateId).toBe(dayTemplate.id);
  });
});

describe('buildRotationPreview', () => {
  it('counts rests, skips occupied dates and totals pay for new shifts', () => {
    const preview = buildRotationPreview(
      '2026-10-25',
      4,
      [dayTemplate.id, null, nightTemplate.id, null],
      [dayTemplate, nightTemplate],
      [makePlan({ id: 'existing', date: '2026-10-27' })],
    );

    expect(preview.totalDays).toBe(28);
    expect(preview.restDays).toBe(14);
    expect(preview.shifts).toHaveLength(13);
    expect(preview.skipped).toHaveLength(1);
    expect(preview.skipped[0].date).toBe('2026-10-27');
    expect(preview.minutes).toBe(7 * 8 * 60 + 6 * 11 * 60);
    expect(preview.earnings).toBe(7 * 160 + 6 * 330);
  });

  it('ignores templates that no longer exist', () => {
    const preview = buildRotationPreview(
      '2026-10-25',
      1,
      [dayTemplate.id, 'missing-template'],
      [dayTemplate],
      [],
    );
    expect(preview.shifts).toHaveLength(4);
    expect(preview.restDays).toBe(3);
  });
});
