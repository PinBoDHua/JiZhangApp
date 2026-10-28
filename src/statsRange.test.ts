import { describe, expect, it } from 'vitest';
import {
  buildBreakdown,
  buildChartPoints,
  pickActivePoint,
  pickDefaultKey,
  resolveRange,
} from './statsRange';
import type { WorkRecord } from './types';

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

const baseRangeInput = {
  records: [] as WorkRecord[],
  today: '2026-10-28',
  currentWeekStart: '2026-10-26',
  weekStart: '2026-10-26',
  yearAnchor: 2026,
  monthYear: 2026,
  monthIndex: 9,
};

describe('resolveRange', () => {
  it('周视图从周一到周日，并标记是否本周', () => {
    const range = resolveRange({ ...baseRangeInput, period: 'week' });
    expect(range.start).toBe('2026-10-26');
    expect(range.end).toBe('2026-11-01');
    expect(range.isCurrent).toBe(true);
    expect(range.label).toBe('10月26日 – 11月1日');
  });

  it('翻到上一周后不再算当前周', () => {
    const range = resolveRange({ ...baseRangeInput, period: 'week', weekStart: '2026-10-19' });
    expect(range.start).toBe('2026-10-19');
    expect(range.end).toBe('2026-10-25');
    expect(range.isCurrent).toBe(false);
    expect(range.resetLabel).toBe('回到本周');
  });

  it('月视图只取当月记录', () => {
    const range = resolveRange({
      ...baseRangeInput,
      period: 'month',
      records: [record('2026-10-01'), record('2026-10-31'), record('2026-11-01')],
    });
    expect(range.start).toBe('2026-10-01');
    expect(range.end).toBe('2026-10-31');
    expect(range.records).toHaveLength(2);
    expect(range.label).toBe('2026年10月');
  });

  it('年视图覆盖整年，标题与是否当年都正确', () => {
    const range = resolveRange({
      ...baseRangeInput,
      period: 'year',
      records: [record('2026-01-01'), record('2025-12-31')],
    });
    expect(range.start).toBe('2026-01-01');
    expect(range.end).toBe('2026-12-31');
    expect(range.records).toHaveLength(1);
    expect(range.isCurrent).toBe(true);
  });

  it('切到别的年份时 isCurrent 为 false', () => {
    const range = resolveRange({ ...baseRangeInput, period: 'year', yearAnchor: 2025 });
    expect(range.isCurrent).toBe(false);
  });
});

describe('buildChartPoints', () => {
  it('月视图按日历天数补齐空柱，并在 1 / 10 / 20 / 月末显示刻度', () => {
    const range = resolveRange({
      ...baseRangeInput,
      period: 'month',
      records: [record('2026-10-01'), record('2026-10-01', { start: '18:00', end: '22:00' })],
    });
    const points = buildChartPoints(range, 'month', 2026, 9);
    expect(points).toHaveLength(31);
    expect(points[0]).toMatchObject({ key: '2026-10-01', earnings: 200, count: 2, minutes: 600 });
    expect(points[1].earnings).toBe(0);
    expect(points[0].axisLabel).toBe('1');
    expect(points[9].axisLabel).toBe('10');
    expect(points[19].axisLabel).toBe('20');
    expect(points[30].axisLabel).toBe('31');
    expect(points[1].axisLabel).toBe('');
  });

  it('年视图把 12 个月聚合成 12 根柱子', () => {
    const range = resolveRange({
      ...baseRangeInput,
      period: 'year',
      records: [record('2026-01-05'), record('2026-01-06'), record('2026-03-01')],
    });
    const points = buildChartPoints(range, 'year', 2026, 0);
    expect(points).toHaveLength(12);
    expect(points[0]).toMatchObject({ key: '2026-01', earnings: 280, count: 2, axisLabel: '1' });
    expect(points[2]).toMatchObject({ key: '2026-03', earnings: 140, count: 1 });
    expect(points[11].earnings).toBe(0);
  });

  it('周视图固定 7 根，标签是周一…周日', () => {
    const range = resolveRange({ ...baseRangeInput, period: 'week', records: [record('2026-10-28')] });
    const points = buildChartPoints(range, 'week', 2026, 9);
    expect(points.map((point) => point.axisLabel)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
    expect(points[2]).toMatchObject({ key: '2026-10-28', earnings: 140 });
  });
});

describe('buildBreakdown', () => {
  it('按班次名合并，并按收入从高到低排序', () => {
    const items = buildBreakdown([
      record('2026-10-01', { shiftName: '夜班', shiftColor: '#5563B8', rate: 30 }),
      record('2026-10-02'),
      record('2026-10-03'),
    ]);
    expect(items.map((item) => item.name)).toEqual(['白班', '夜班']);
    expect(items[0]).toMatchObject({ minutes: 840, earnings: 280, count: 2 });
    expect(items[1]).toMatchObject({ minutes: 420, earnings: 210, count: 1, color: '#5563B8' });
  });

  it('没有记录时返回空数组', () => {
    expect(buildBreakdown([])).toEqual([]);
  });
});

describe('pickDefaultKey / pickActivePoint', () => {
  const points = [
    { key: 'a', axisLabel: '', focusLabel: '', earnings: 0, minutes: 0, count: 0 },
    { key: 'b', axisLabel: '', focusLabel: '', earnings: 10, minutes: 60, count: 1 },
    { key: 'c', axisLabel: '', focusLabel: '', earnings: 0, minutes: 0, count: 0 },
  ];

  it('优先今天，其次最后一个有数据的日子', () => {
    expect(pickDefaultKey(points, 'c')).toBe('c');
    expect(pickDefaultKey(points, 'today')).toBe('b');
    expect(pickDefaultKey([points[0]], 'today')).toBe('a');
    expect(pickDefaultKey([], 'today')).toBe('');
  });

  it('选中项不在当前周期时回落到默认柱', () => {
    expect(pickActivePoint(points, 'zzz', 'b')?.key).toBe('b');
    expect(pickActivePoint(points, 'a', 'b')?.key).toBe('a');
    expect(pickActivePoint([], null, 'b')).toBeUndefined();
  });
});
