import type { StatsPeriod, WorkRecord } from './types';
import { round2 } from './num';
import {
  addDaysISO,
  daysInMonth,
  formatDateRangeCN,
  monthKey,
  monthLabel,
  pad2,
  parseISODate,
  recordPay,
  recordsInMonth,
  recordsInRange,
} from './utils';
import { summarizeByDate } from './overview';

/**
 * 统计页的周期解析与图表数据（2.4 从 Stats.tsx 抽出的纯函数）。
 *
 * 抽出来的理由：
 * - 这些逻辑都是「输入记录 + 当前周期 → 输出可渲染数据」，不需要 React；
 * - 计算口径（周从周一开始、年按 12 个月聚合、月按日历天数补齐空柱）
 *   可以被单测直接锁住，回归时不用起浏览器；
 * - 组件只剩渲染，读代码时不必在 JSX 里翻找金额是怎么算出来的。
 */

export interface ChartPoint {
  key: string;
  axisLabel: string;
  earnings: number;
  minutes: number;
  count: number;
  focusLabel: string;
}

export interface BreakdownItem {
  name: string;
  color: string;
  minutes: number;
  earnings: number;
  count: number;
}

export interface RangeInput {
  period: StatsPeriod;
  records: WorkRecord[];
  today: string;
  currentWeekStart: string;
  weekStart: string;
  yearAnchor: number;
  monthYear: number;
  monthIndex: number;
}

export interface StatsRange {
  start: string;
  end: string;
  records: WorkRecord[];
  label: string;
  isCurrent: boolean;
  currentLabel: string;
  resetLabel: string;
  previousLabel: string;
  nextLabel: string;
  emptyLabel: string;
}

const WEEKDAY_LETTERS = ['一', '二', '三', '四', '五', '六', '日'];

/** 解析当前统计周期的时间范围与对应记录 */
export function resolveRange({
  period,
  records,
  today,
  currentWeekStart,
  weekStart,
  yearAnchor,
  monthYear,
  monthIndex,
}: RangeInput): StatsRange {
  if (period === 'week') {
    const end = addDaysISO(weekStart, 6);
    return {
      start: weekStart,
      end,
      records: recordsInRange(records, weekStart, end),
      label: formatDateRangeCN(weekStart, end),
      isCurrent: weekStart === currentWeekStart,
      currentLabel: '本周',
      resetLabel: '回到本周',
      previousLabel: '上一周',
      nextLabel: '下一周',
      emptyLabel: '本周',
    };
  }
  if (period === 'year') {
    const start = `${yearAnchor}-01-01`;
    const end = `${yearAnchor}-12-31`;
    return {
      start,
      end,
      records: recordsInRange(records, start, end),
      label: `${yearAnchor}年`,
      isCurrent: start.startsWith(today.slice(0, 4)),
      currentLabel: '今年',
      resetLabel: '回到今年',
      previousLabel: '上一年',
      nextLabel: '下一年',
      emptyLabel: '今年',
    };
  }
  const start = `${monthKey(monthYear, monthIndex)}-01`;
  const end = `${monthKey(monthYear, monthIndex)}-${pad2(daysInMonth(monthYear, monthIndex))}`;
  return {
    start,
    end,
    records: recordsInMonth(records, monthYear, monthIndex),
    label: monthLabel(monthYear, monthIndex),
    isCurrent: `${monthYear}-${pad2(monthIndex + 1)}` === today.slice(0, 7),
    currentLabel: '本月',
    resetLabel: '回到本月',
    previousLabel: '上个月',
    nextLabel: '下个月',
    emptyLabel: '本月',
  };
}

/**
 * 图表柱：周看 7 天，月看当月每一天，年看 12 个月。
 * 先把记录按日汇总一次，再按周期取数，避免 31 天 × 全量记录的重复过滤。
 */
export function buildChartPoints(
  range: StatsRange,
  period: StatsPeriod,
  monthYear: number,
  monthIndex: number,
): ChartPoint[] {
  const totals = summarizeByDate(range.records);
  const dayPoint = (date: string, axisLabel: string, focusLabel: string): ChartPoint => {
    const day = totals.get(date);
    return {
      key: date,
      axisLabel,
      focusLabel,
      earnings: day?.earnings ?? 0,
      minutes: day?.minutes ?? 0,
      count: day?.shifts ?? 0,
    };
  };

  if (period === 'week') {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDaysISO(range.start, index);
      const parsed = parseISODate(date);
      return dayPoint(date, WEEKDAY_LETTERS[index], `${parsed.getMonth() + 1}月${parsed.getDate()}日`);
    });
  }

  if (period === 'year') {
    const year = range.start.slice(0, 4);
    const months = new Map<string, { earnings: number; minutes: number; count: number }>();
    totals.forEach((day, date) => {
      const key = date.slice(0, 7);
      const current = months.get(key) ?? { earnings: 0, minutes: 0, count: 0 };
      current.earnings += day.earnings;
      current.minutes += day.minutes;
      current.count += day.shifts;
      months.set(key, current);
    });
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const key = `${year}-${pad2(month)}`;
      const monthTotal = months.get(key);
      return {
        key,
        axisLabel: String(month),
        focusLabel: `${month}月`,
        earnings: monthTotal ? round2(monthTotal.earnings) : 0,
        minutes: monthTotal?.minutes ?? 0,
        count: monthTotal?.count ?? 0,
      };
    });
  }

  const dayCount = daysInMonth(monthYear, monthIndex);
  const prefix = range.start.slice(0, 7);
  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const showAxis = day === 1 || day === 10 || day === 20 || day === dayCount;
    return dayPoint(
      `${prefix}-${pad2(day)}`,
      showAxis ? String(day) : '',
      `${monthIndex + 1}月${day}日`,
    );
  });
}

/** 按班次名汇总：每条记录只计薪一次 */
export function buildBreakdown(records: WorkRecord[]): BreakdownItem[] {
  const map = new Map<string, BreakdownItem>();
  records.forEach((record) => {
    const pay = recordPay(record);
    const existing = map.get(record.shiftName);
    if (existing) {
      existing.minutes += pay.minutes;
      existing.earnings += pay.total;
      existing.count += 1;
      return;
    }
    map.set(record.shiftName, {
      name: record.shiftName,
      color: record.shiftColor,
      minutes: pay.minutes,
      earnings: pay.total,
      count: 1,
    });
  });
  return Array.from(map.values()).sort((a, b) => b.earnings - a.earnings);
}

/**
 * 默认选中的柱子：今天（年视图为本月）→ 最后一个有数据的柱子 → 最后一根。
 * 倒序查找避免复制整个数组再 reverse。
 */
export function pickDefaultKey(chartPoints: ChartPoint[], todayKey: string): string {
  const todayPoint = chartPoints.find((point) => point.key === todayKey);
  if (todayPoint) return todayPoint.key;
  for (let index = chartPoints.length - 1; index >= 0; index -= 1) {
    if (chartPoints[index].count > 0) return chartPoints[index].key;
  }
  return chartPoints.at(-1)?.key ?? '';
}

/** 选中项为空时的兜底：保持「默认柱 → 第一根」的降级顺序 */
export function pickActivePoint(
  chartPoints: ChartPoint[],
  selectedKey: string | null,
  defaultKey: string,
): ChartPoint | undefined {
  return (
    chartPoints.find((point) => point.key === selectedKey) ??
    chartPoints.find((point) => point.key === defaultKey) ??
    chartPoints[0]
  );
}
