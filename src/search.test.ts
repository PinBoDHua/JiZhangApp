import { describe, expect, it } from 'vitest';
import { filterRecords, normalizeSearchQuery } from './search';
import type { WorkRecord } from './types';

function record(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id: 'record-1',
    date: '2026-10-24',
    templateId: null,
    shiftName: '夜班',
    shiftColor: '#5563B8',
    start: '20:00',
    end: '08:00',
    breakMinutes: 60,
    rate: 30,
    multiplier: 1.5,
    note: '顶班',
    overtime: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('normalizeSearchQuery', () => {
  it('trims and lowercases latin text', () => {
    expect(normalizeSearchQuery('  NIGHT ')).toBe('night');
  });
});

describe('filterRecords', () => {
  const rows = [
    record(),
    record({ id: 'record-2', date: '2026-09-01', shiftName: '白班', note: '' }),
    record({ id: 'record-3', date: '2026-11-11', shiftName: '早班', note: '培训' }),
  ];

  it('returns the original array for an empty query (keeps reference for memo)', () => {
    expect(filterRecords(rows, '')).toBe(rows);
    expect(filterRecords(rows, '   ')).toBe(rows);
  });

  it('matches shift name, note and ISO date', () => {
    expect(filterRecords(rows, '夜')).toHaveLength(1);
    expect(filterRecords(rows, '培训')[0].id).toBe('record-3');
    expect(filterRecords(rows, '2026-09')).toHaveLength(1);
  });

  it('matches the Chinese date label', () => {
    // 10月24日 · 周六
    expect(filterRecords(rows, '10月24日')[0].id).toBe('record-1');
  });

  it('is case insensitive for latin input', () => {
    const latin = [record({ shiftName: 'Night Shift', note: '' })];
    expect(filterRecords(latin, 'night')).toHaveLength(1);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterRecords(rows, '不存在')).toEqual([]);
  });
});
