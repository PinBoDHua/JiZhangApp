import type { DayPayRule, ShiftTemplate, WorkRecord } from './types';
import { SHIFT_COLORS } from './types';
import { resolveDayRule } from './dayRule';
import type { RecordDraft } from './batch';
import { isISODate, isTimeHM } from './storage';
import { rawMinutes } from './utils';

/**
 * CSV 导入（2.2）：
 * - 兼容本应用导出的表格，也接受 Excel 里手工整理的简化表头；
 * - 只认「日期 / 开始 / 结束 / 时薪」四类核心列，其余列（工时、收入等）忽略；
 * - 已存在的记录按「日期 + 班次 + 开始时间」去重，不会重复计薪。
 */

type ColumnKey =
  | 'date'
  | 'shiftName'
  | 'start'
  | 'end'
  | 'breakMinutes'
  | 'rate'
  | 'multiplier'
  | 'note';

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  date: ['日期', 'date', '工作日期'],
  shiftName: ['班次', '班次名称', 'shift', 'shiftname', '名称'],
  start: ['开始', '开始时间', '上班', '上班时间', 'start', 'starttime'],
  end: ['结束', '结束时间', '下班', '下班时间', 'end', 'endtime'],
  breakMinutes: [
    '休息(分钟)',
    '休息（分钟）',
    '休息分钟',
    '休息',
    'break',
    'breakminutes',
  ],
  rate: ['时薪', '时薪(元)', '时薪（元）', 'rate', 'hourlyrate'],
  multiplier: ['倍数', '计薪倍数', 'multiplier'],
  note: ['备注', 'note', 'remark', 'memo'],
};

const normalizeHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')');

/** RFC 4180 风格的最小解析器：支持引号、转义引号、CRLF 与 BOM */
export function parseCsvText(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const pushRow = () => {
    row.push(field);
    field = '';
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      pushRow();
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

function mapHeaders(header: string[]): Partial<Record<ColumnKey, number>> {
  const map: Partial<Record<ColumnKey, number>> = {};
  header.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    (Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach((key) => {
      if (map[key] !== undefined) return;
      if (HEADER_ALIASES[key].some((alias) => normalizeHeader(alias) === normalized)) {
        map[key] = index;
      }
    });
  });
  return map;
}

/** 2026/1/5、2026.1.5、2026-1-5 都归一化成 2026-01-05 */
export function normalizeCsvDate(value: string): string | null {
  const trimmed = value.trim();
  if (isISODate(trimmed)) return trimmed;
  const matched = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (!matched) return null;
  const iso = `${matched[1]}-${matched[2].padStart(2, '0')}-${matched[3].padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
}

/** 9:00、09:00、08：30 都能识别 */
export function normalizeCsvTime(value: string): string | null {
  const trimmed = value.trim().replace(/：/g, ':');
  if (isTimeHM(trimmed)) return trimmed;
  const matched = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!matched) return null;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${matched[2]}`;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return row[index] ?? '';
}

export interface CsvImportResult {
  records: RecordDraft[];
  total: number;
  skipped: number;
  invalid: number;
  errors: string[];
}

export interface CsvImportOptions {
  records: WorkRecord[];
  templates: ShiftTemplate[];
  dayRule?: DayPayRule;
}

export function parseCsvRecords(text: string, options: CsvImportOptions): CsvImportResult {
  const rows = parseCsvText(text);
  if (rows.length < 2) {
    throw new Error('表格至少要有表头和一行数据');
  }
  const header = mapHeaders(rows[0]);
  if (header.date === undefined || header.start === undefined || header.end === undefined) {
    throw new Error('缺少「日期 / 开始 / 结束」列，请参考导出的表格格式');
  }

  const existing = new Set(
    options.records.map(
      (record) => `${record.date}|${record.shiftName}|${record.start}`,
    ),
  );
  const seen = new Set<string>();
  const records: RecordDraft[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let invalid = 0;

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const date = normalizeCsvDate(cell(row, header.date));
    const start = normalizeCsvTime(cell(row, header.start));
    const end = normalizeCsvTime(cell(row, header.end));
    if (!date || !start || !end) {
      invalid += 1;
      if (errors.length < 3) errors.push(`第 ${line} 行：日期或时间格式无法识别`);
      return;
    }
    const totalMinutes = rawMinutes(start, end);
    if (totalMinutes <= 0) {
      invalid += 1;
      if (errors.length < 3) errors.push(`第 ${line} 行：开始与结束时间不能相同`);
      return;
    }
    const breakMinutes = toNumber(cell(row, header.breakMinutes)) ?? 0;
    if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes >= totalMinutes) {
      invalid += 1;
      if (errors.length < 3) errors.push(`第 ${line} 行：休息时长不合理`);
      return;
    }
    const rawName = cell(row, header.shiftName).trim();
    const matchedTemplate = rawName
      ? options.templates.find((template) => template.name === rawName)
      : undefined;
    // 没写班次名时沿用第一个模板，让时间、时薪、颜色都有合理默认值
    const template = matchedTemplate ?? (rawName ? undefined : options.templates[0]);
    const shiftName = rawName || template?.name || '导入班次';
    const rateValue = toNumber(cell(row, header.rate));
    const rate = rateValue ?? template?.rate ?? 0;
    if (!Number.isFinite(rate) || rate < 0) {
      invalid += 1;
      if (errors.length < 3) errors.push(`第 ${line} 行：时薪不合理`);
      return;
    }
    const multiplierValue = toNumber(cell(row, header.multiplier));
    const multiplier =
      multiplierValue !== null && multiplierValue > 0
        ? multiplierValue
        : resolveDayRule(options.dayRule, date).multiplier;
    const key = `${date}|${shiftName}|${start}`;
    if (existing.has(key) || seen.has(key)) {
      skipped += 1;
      return;
    }
    seen.add(key);
    records.push({
      date,
      templateId: template?.id ?? null,
      shiftName,
      shiftColor: template?.color ?? SHIFT_COLORS[0],
      start,
      end,
      breakMinutes: Math.round(breakMinutes),
      rate,
      multiplier,
      note: cell(row, header.note).trim(),
      overtime: template?.overtime ?? null,
    });
  });

  return {
    records,
    total: rows.length - 1,
    skipped,
    invalid,
    errors,
  };
}
