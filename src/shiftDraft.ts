import { isValidOvertimeRule } from './pay';
import type { OvertimeRule } from './types';
import { rawMinutes } from './utils';

export interface ShiftDraftValues {
  shiftName: string;
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
  overtime?: OvertimeRule | null;
}

/**
 * 记录、排班、班次模板共用同一套校验，避免三个表单的提示和判断顺序走样。
 * 返回空字符串表示通过。
 */
export function validateShiftDraft(
  values: ShiftDraftValues,
  raw = rawMinutes(values.start, values.end),
): string {
  if (!values.shiftName.trim()) return '请填写班次名称';
  if (raw === 0) return '开始和结束时间不能相同';
  if (values.breakMinutes >= raw) return '休息时长不能超过班次总时长';
  if (!Number.isFinite(values.rate) || values.rate < 0) return '时薪不能为负数';
  if (values.overtime && !isValidOvertimeRule(values.overtime)) {
    return '加班规则有误，请检查标准工时和加班倍数';
  }
  return '';
}
