/**
 * 计薪桥接：把「记录 / 排班 / 临时输入」统一折算成 PayBreakdown。
 *
 * 只依赖 pay.ts（分段计薪算法）与 date.ts（工时），不关心记录怎么存、页面怎么展示。
 */

import type { OvertimeRule, PlannedShift, WorkRecord } from '../types';
import { computePay, type PayBreakdown } from '../pay';
import { workedMinutes } from './date';

export interface ShiftPayInput {
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
  multiplier: number;
  overtime?: OvertimeRule | null;
}

/**
 * 时间 + 时薪 + 规则 → 完整计薪明细。所有页面都从这里取数，
 * 避免记录、排班、工资条各自重复一套算法。
 */
export function shiftPay(input: ShiftPayInput): PayBreakdown {
  return computePay({
    minutes: workedMinutes(input.start, input.end, input.breakMinutes),
    rate: input.rate,
    multiplier: input.multiplier,
    overtime: input.overtime,
  });
}

/**
 * 计薪结果按对象引用缓存。
 *
 * 记录与排班在整条链路上都是不可变的：编辑时用 `{ ...record, ...input }` 生成新对象，
 * 所以「同一个对象 ⇒ 计算结果必然相同」，按引用缓存不会读到过期金额。
 *
 * 收益：同一批记录在一次渲染里会被多处重复计薪——
 * 统计页的汇总 / 图表 / 班次构成各遍历一次，日历页的按日汇总与月汇总各一次。
 * 年视图下这是 3000 条 × 3 次的重复浮点运算，缓存后降到每条一次。
 * 用 WeakMap 而非 Map：记录被替换后旧对象可被回收，长会话也不会累积。
 */
const payCache = new WeakMap<ShiftPayInput, PayBreakdown>();

/** 带缓存的计薪：缓存的是只读结果，调用方不得修改返回对象 */
function cachedShiftPay(input: ShiftPayInput): PayBreakdown {
  const cached = payCache.get(input);
  if (cached) return cached;
  const pay = shiftPay(input);
  payCache.set(input, pay);
  return pay;
}

export function earningsOf(input: ShiftPayInput): number {
  return cachedShiftPay(input).total;
}

export function recordPay(record: WorkRecord): PayBreakdown {
  return cachedShiftPay(record);
}

export function planPay(plan: PlannedShift): PayBreakdown {
  return cachedShiftPay(plan);
}

export function recordEarnings(record: WorkRecord): number {
  return recordPay(record).total;
}

export function recordMinutes(record: WorkRecord): number {
  return workedMinutes(record.start, record.end, record.breakMinutes);
}
