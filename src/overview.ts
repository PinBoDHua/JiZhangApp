import type { PlannedShift, WorkRecord } from './types';
import { round2 } from './num';
import {
  addDaysISO,
  getWeekRange,
  monthKey,
  pad2,
  planPay,
  recordPay,
} from './utils';

/**
 * 首页与周期视图的派生数据。
 *
 * 这些数字以前在组件里用多次 filter / reduce 现算，记录一多就会重复计薪
 * （同一条记录为了「工时」和「收入」各算一次）。这里统一改成一次遍历，
 * 让组件只做展示，派生结果也能被 useMemo 复用与被测试覆盖。
 */

export interface DayTotal {
  date: string;
  earnings: number;
  minutes: number;
  shifts: number;
}

export interface PeriodTotals {
  earnings: number;
  minutes: number;
  days: number;
  shifts: number;
}

/**
 * 按日期汇总的公共实现。
 *
 * 记录与排班的汇总规则完全一致（同一天累加收入、工时、班次），
 * 区别只在「用哪套计薪结果」。以前两份代码是复制的，改动一处很容易漏掉另一处。
 */
function summarizeByDateWith<T extends { date: string }>(
  items: T[],
  payOf: (item: T) => { total: number; minutes: number },
): Map<string, DayTotal> {
  const totals = new Map<string, DayTotal>();
  items.forEach((item) => {
    const pay = payOf(item);
    const current = totals.get(item.date);
    if (current) {
      current.earnings += pay.total;
      current.minutes += pay.minutes;
      current.shifts += 1;
      return;
    }
    totals.set(item.date, {
      date: item.date,
      earnings: pay.total,
      minutes: pay.minutes,
      shifts: 1,
    });
  });
  return totals;
}

/** 一次遍历按日期汇总收入与工时（每条记录只计薪一次） */
export function summarizeByDate(records: WorkRecord[]): Map<string, DayTotal> {
  return summarizeByDateWith(records, recordPay);
}

/** 排班也按日期汇总：用于月历「预计收入」与当天排班合计 */
export function summarizePlansByDate(plans: PlannedShift[]): Map<string, DayTotal> {
  return summarizeByDateWith(plans, planPay);
}

/** 把若干天的汇总合并成一个周期汇总（只统计有记录的日子） */
export function periodTotals(
  totals: ReadonlyMap<string, DayTotal>,
  dates: Iterable<string>,
): PeriodTotals {
  let earnings = 0;
  let minutes = 0;
  let days = 0;
  let shifts = 0;
  for (const date of dates) {
    const day = totals.get(date);
    if (!day || day.shifts === 0) continue;
    earnings += day.earnings;
    minutes += day.minutes;
    days += 1;
    shifts += day.shifts;
  }
  return { earnings: round2(earnings), minutes, days, shifts };
}

/** 某年某月的完整日期列表（用于从按日汇总里取月度数据） */
export function monthDates(year: number, monthIndex: number): string[] {
  const prefix = monthKey(year, monthIndex);
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${prefix}-${pad2(index + 1)}`);
}

export function monthTotals(
  year: number,
  monthIndex: number,
  totals: ReadonlyMap<string, DayTotal>,
): PeriodTotals {
  return periodTotals(totals, monthDates(year, monthIndex));
}

export interface WeekOverview {
  start: string;
  end: string;
  dates: string[];
  /** 今天在本周的位置，不在本周内时为 -1 */
  todayIndex: number;
  current: PeriodTotals;
  previous: PeriodTotals;
  /** 本周收入 - 上周同期收入 */
  difference: number;
  points: DayTotal[];
  maxDayEarnings: number;
  hasData: boolean;
}

/**
 * 本周概览。
 * 上周只取到与今天相同的星期位置，周初对比才不会被「整周 vs 半周」拉出假跌幅。
 */
export function buildWeekOverview(
  today: string,
  totals: ReadonlyMap<string, DayTotal>,
): WeekOverview {
  const { start, end } = getWeekRange(today);
  const dates = Array.from({ length: 7 }, (_, index) => addDaysISO(start, index));
  const todayIndex = dates.indexOf(today);
  const previousStart = getWeekRange(addDaysISO(start, -7)).start;
  const previousDates = dates.map((_, index) => addDaysISO(previousStart, index));
  const previousCutoff = todayIndex >= 0 ? todayIndex : 6;

  const current = periodTotals(totals, dates);
  const previous = periodTotals(totals, previousDates.slice(0, previousCutoff + 1));
  const points = dates.map(
    (date) => totals.get(date) ?? { date, earnings: 0, minutes: 0, shifts: 0 },
  );

  return {
    start,
    end,
    dates,
    todayIndex,
    current,
    previous,
    difference: round2(current.earnings - previous.earnings),
    points,
    maxDayEarnings: points.reduce((max, point) => Math.max(max, point.earnings), 0),
    hasData: current.shifts > 0 || previous.shifts > 0,
  };
}
