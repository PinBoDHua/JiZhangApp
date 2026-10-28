import type { WorkRecord } from './types';
import { formatDateCN } from './utils';

/** 搜索输入归一化：去首尾空格并统一小写，中文不受影响 */
export function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 记录搜索：命中班次名、备注、日期原文，或「10月24日 · 周五」这样的中文日期。
 *
 * 与逐条拼接字段再 includes 相比，这里用短路判断，
 * 只有前三个字段都没命中时才去解析日期，长列表下能省掉大部分 Date 构造。
 */
export function filterRecords(records: WorkRecord[], query: string): WorkRecord[] {
  const needle = normalizeSearchQuery(query);
  if (!needle) return records;
  return records.filter((record) => {
    if (record.shiftName.toLowerCase().includes(needle)) return true;
    if (record.note.toLowerCase().includes(needle)) return true;
    if (record.date.includes(needle)) return true;
    return formatDateCN(record.date).toLowerCase().includes(needle);
  });
}
