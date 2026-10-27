import { describe, expect, it } from 'vitest';
import {
  normalizeCsvDate,
  normalizeCsvTime,
  parseCsvRecords,
  parseCsvText,
} from './csv';
import { DEFAULT_DAY_PAY_RULE, type ShiftTemplate, type WorkRecord } from './types';

const template: ShiftTemplate = {
  id: 'template-day',
  name: '白班',
  color: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
};

const existing: WorkRecord = {
  id: 'record-1',
  date: '2026-10-27',
  templateId: template.id,
  shiftName: '白班',
  shiftColor: template.color,
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
};

const options = {
  records: [existing],
  templates: [template],
  dayRule: { ...DEFAULT_DAY_PAY_RULE, enabled: true, weekendMultiplier: 2 },
};

describe('csv import', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    const rows = parseCsvText('日期,备注\r\n2026-10-27,"顶班, 两小时"\r\n2026-10-28,"他说""好"""\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe('顶班, 两小时');
    expect(rows[2][1]).toBe('他说"好"');
  });

  it('strips a UTF-8 BOM', () => {
    const rows = parseCsvText('\uFEFF日期,开始\r\n2026-10-27,08:00');
    expect(rows[0][0]).toBe('日期');
  });

  it('normalizes flexible date and time formats', () => {
    expect(normalizeCsvDate('2026/1/5')).toBe('2026-01-05');
    expect(normalizeCsvDate('2026.1.5')).toBe('2026-01-05');
    expect(normalizeCsvDate('2026-02-30')).toBeNull();
    expect(normalizeCsvDate('1月5日')).toBeNull();
    expect(normalizeCsvTime('9:00')).toBe('09:00');
    expect(normalizeCsvTime('08：30')).toBe('08:30');
    expect(normalizeCsvTime('25:00')).toBeNull();
  });

  it('imports valid rows, skips duplicates and counts invalid lines', () => {
    const csv = [
      '日期,班次,开始,结束,休息(分钟),时薪,倍数,备注',
      '2026-10-27,白班,08:00,17:00,60,20,1,重复',
      '2026-10-31,白班,08:00,17:00,60,22,,周末',
      '2026/11/1,夜班,20:00,8:00,60,30,1.5,跨午夜',
      '2026-13-01,白班,08:00,17:00,60,20,1,坏日期',
      '2026-11-02,白班,08:00,08:00,0,20,1,零时长',
    ].join('\r\n');

    const result = parseCsvRecords(csv, options);
    expect(result.total).toBe(5);
    expect(result.records).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.invalid).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.records[0].date).toBe('2026-10-31');
    expect(result.records[0].multiplier).toBe(2);
    expect(result.records[1].date).toBe('2026-11-01');
    expect(result.records[1].multiplier).toBe(1.5);
    expect(result.records[1].shiftName).toBe('夜班');
  });

  it('falls back to the template rate and colour when columns are missing', () => {
    const csv = '日期,开始,结束\n2026-11-03,08:00,17:00';
    const result = parseCsvRecords(csv, options);
    expect(result.records[0].rate).toBe(20);
    expect(result.records[0].shiftColor).toBe('#D08A2E');
    expect(result.records[0].shiftName).toBe('白班');
    expect(result.records[0].templateId).toBe('template-day');
  });

  it('rejects a table that lacks the required columns', () => {
    expect(() => parseCsvRecords('日期,备注\n2026-10-27,x', options)).toThrow(
      '缺少「日期 / 开始 / 结束」列',
    );
    expect(() => parseCsvRecords('日期,开始,结束', options)).toThrow(
      '表格至少要有表头和一行数据',
    );
  });

  it('does not import the same row twice inside one file', () => {
    const csv = [
      '日期,开始,结束',
      '2026-11-04,08:00,17:00',
      '2026-11-04,08:00,17:00',
    ].join('\n');
    const result = parseCsvRecords(csv, options);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });
});
