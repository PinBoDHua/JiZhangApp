import type { OvertimeRule } from './types';

/** 默认每天 8 小时标准工时，超出部分按 1.5 倍计加班。 */
export const DEFAULT_STANDARD_MINUTES = 8 * 60;
export const DEFAULT_OVERTIME_MULTIPLIER = 1.5;
export const MIN_STANDARD_MINUTES = 30;
export const MAX_STANDARD_MINUTES = 24 * 60;
export const MIN_OVERTIME_MULTIPLIER = 1.25;
export const MAX_OVERTIME_MULTIPLIER = 10;

/** 加班倍数候选项，与整班计薪倍数分开，避免出现「加班 1×」 */
export const OVERTIME_MULTIPLIER_OPTIONS = [1.25, 1.5, 1.75, 2, 3] as const;

export interface PayBreakdown {
  /** 计薪的有效分钟数（已扣休息） */
  minutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  regularPay: number;
  overtimePay: number;
  total: number;
  /** 折算后的实际时薪 */
  effectiveRate: number;
  /** 实际生效的加班规则（倍数已按不低于正常班次处理） */
  overtime: OvertimeRule | null;
}

export interface PayInput {
  minutes: number;
  rate: number;
  multiplier: number;
  overtime?: OvertimeRule | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** 备份/本地数据校验：加班规则必须落在应用能写出的范围内 */
export function isValidOvertimeRule(value: unknown): value is OvertimeRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.standardMinutes === 'number' &&
    Number.isFinite(rule.standardMinutes) &&
    rule.standardMinutes >= MIN_STANDARD_MINUTES &&
    rule.standardMinutes <= MAX_STANDARD_MINUTES &&
    typeof rule.multiplier === 'number' &&
    Number.isFinite(rule.multiplier) &&
    rule.multiplier > 1 &&
    rule.multiplier <= MAX_OVERTIME_MULTIPLIER
  );
}

/**
 * 统一入口：规则不完整（缺字段、标准工时越界、倍数不大于 1）时视为未开启，
 * 避免旧数据或手工改坏的备份把金额算成 NaN。
 */
export function normalizeOvertimeRule(
  rule?: OvertimeRule | null,
): OvertimeRule | null {
  if (!isValidOvertimeRule(rule)) return null;
  return {
    standardMinutes: Math.round(rule.standardMinutes),
    multiplier: Math.round(rule.multiplier * 100) / 100,
  };
}

/**
 * 分段计薪的核心：
 * - 标准工时以内按班次自身的计薪倍数；
 * - 超出部分按加班倍数，且不低于正常时段的倍数（加班不应比正常班便宜）；
 * - 没有规则或规则无效时与旧版「整班 × 倍数」完全一致。
 */
export function computePay(input: PayInput): PayBreakdown {
  const minutes =
    Number.isFinite(input.minutes) && input.minutes > 0
      ? Math.min(MAX_STANDARD_MINUTES, Math.round(input.minutes))
      : 0;
  const rate =
    Number.isFinite(input.rate) && input.rate > 0 ? input.rate : 0;
  const multiplier =
    Number.isFinite(input.multiplier) && input.multiplier > 0
      ? input.multiplier
      : 1;
  const rule = normalizeOvertimeRule(input.overtime);

  let regularMinutes = minutes;
  let overtimeMinutes = 0;
  if (rule && minutes > rule.standardMinutes) {
    regularMinutes = rule.standardMinutes;
    overtimeMinutes = minutes - rule.standardMinutes;
  }

  const regularPay = round2((regularMinutes / 60) * rate * multiplier);
  const overtimeMultiplier = rule ? Math.max(multiplier, rule.multiplier) : multiplier;
  const overtimePay = round2((overtimeMinutes / 60) * rate * overtimeMultiplier);
  const total = round2(regularPay + overtimePay);

  return {
    minutes,
    regularMinutes,
    overtimeMinutes,
    regularPay,
    overtimePay,
    total,
    effectiveRate: minutes > 0 ? round2(total / (minutes / 60)) : 0,
    overtime: rule ? { ...rule, multiplier: overtimeMultiplier } : null,
  };
}
