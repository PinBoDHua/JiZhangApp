import type { WorkRecord } from './types';
import {
  addDaysISO,
  daysInMonth,
  formatDateCN,
  formatDuration,
  formatMoney,
  pad2,
  recordPay,
} from './utils';

export interface AnnualDay {
  date: string;
  earnings: number;
  minutes: number;
  shifts: number;
  overtimeMinutes: number;
}

export interface AnnualMonth {
  /** 1-12 */
  month: number;
  earnings: number;
  minutes: number;
  days: number;
  shifts: number;
  overtimeMinutes: number;
}

export interface AnnualShiftSummary {
  name: string;
  color: string;
  count: number;
  earnings: number;
}

export interface AnnualSummary {
  year: number;
  earnings: number;
  minutes: number;
  days: number;
  shifts: number;
  averageRate: number;
  overtimeMinutes: number;
  overtimeEarnings: number;
  activeMonths: number;
  bestMonth: AnnualMonth | null;
  bestDay: AnnualDay | null;
  longestStreak: number;
  topShift: AnnualShiftSummary | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function recordsOfYear(records: WorkRecord[], year: number): WorkRecord[] {
  const prefix = `${year}-`;
  return records.filter((record) => record.date.startsWith(prefix));
}

function buildDayMap(records: WorkRecord[], year: number): Map<string, AnnualDay> {
  const map = new Map<string, AnnualDay>();
  recordsOfYear(records, year).forEach((record) => {
    const pay = recordPay(record);
    const day = map.get(record.date) ?? {
      date: record.date,
      earnings: 0,
      minutes: 0,
      shifts: 0,
      overtimeMinutes: 0,
    };
    day.earnings = round2(day.earnings + pay.total);
    day.minutes += pay.minutes;
    day.shifts += 1;
    day.overtimeMinutes += pay.overtimeMinutes;
    map.set(record.date, day);
  });
  return map;
}

/** 全年逐日数据，包含没有记录的日期，方便热力图直接映射 */
export function buildAnnualDays(records: WorkRecord[], year: number): AnnualDay[] {
  const map = buildDayMap(records, year);
  return Array.from({ length: daysInYear(year) }, (_, index) => {
    const date = addDaysISO(`${year}-01-01`, index);
    return (
      map.get(date) ?? {
        date,
        earnings: 0,
        minutes: 0,
        shifts: 0,
        overtimeMinutes: 0,
      }
    );
  });
}

/** 12 行 × 31 列的年度热力图，超出当月天数的格子为 null */
export function buildYearHeatmap(
  records: WorkRecord[],
  year: number,
): (AnnualDay | null)[][] {
  const dayMap = buildDayMap(records, year);
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const total = daysInMonth(year, monthIndex);
    return Array.from({ length: 31 }, (_, dayIndex) => {
      if (dayIndex >= total) return null;
      const date = `${year}-${pad2(monthIndex + 1)}-${pad2(dayIndex + 1)}`;
      return (
        dayMap.get(date) ?? {
          date,
          earnings: 0,
          minutes: 0,
          shifts: 0,
          overtimeMinutes: 0,
        }
      );
    });
  });
}

function longestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...new Set(dates)].sort();
  let longest = 1;
  let current = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (addDaysISO(sorted[index - 1], 1) === sorted[index]) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

export function buildAnnualSummary(records: WorkRecord[], year: number): AnnualSummary {
  const yearRecords = recordsOfYear(records, year);
  const dayMap = buildDayMap(yearRecords, year);
  const monthMap = new Map<number, AnnualMonth>();

  let earnings = 0;
  let minutes = 0;
  let overtimeMinutes = 0;
  let overtimeEarnings = 0;
  const shiftMap = new Map<string, AnnualShiftSummary>();

  yearRecords.forEach((record) => {
    const pay = recordPay(record);
    const month = Number(record.date.slice(5, 7));
    const monthEntry = monthMap.get(month) ?? {
      month,
      earnings: 0,
      minutes: 0,
      days: 0,
      shifts: 0,
      overtimeMinutes: 0,
    };
    monthEntry.earnings = round2(monthEntry.earnings + pay.total);
    monthEntry.minutes += pay.minutes;
    monthEntry.shifts += 1;
    monthEntry.overtimeMinutes += pay.overtimeMinutes;
    monthMap.set(month, monthEntry);

    earnings += pay.total;
    minutes += pay.minutes;
    overtimeMinutes += pay.overtimeMinutes;
    overtimeEarnings += pay.overtimePay;

    const shift = shiftMap.get(record.shiftName) ?? {
      name: record.shiftName,
      color: record.shiftColor,
      count: 0,
      earnings: 0,
    };
    shift.count += 1;
    shift.earnings = round2(shift.earnings + pay.total);
    shiftMap.set(record.shiftName, shift);
  });

  const daysByMonth = new Map<number, Set<string>>();
  yearRecords.forEach((record) => {
    const month = Number(record.date.slice(5, 7));
    const dates = daysByMonth.get(month) ?? new Set<string>();
    dates.add(record.date);
    daysByMonth.set(month, dates);
  });
  daysByMonth.forEach((dates, month) => {
    const entry = monthMap.get(month);
    if (entry) entry.days = dates.size;
  });

  const months = Array.from(monthMap.values()).sort((a, b) => a.month - b.month);
  const bestMonth =
    months.length > 0
      ? months.reduce((best, month) => (month.earnings > best.earnings ? month : best))
      : null;
  const dayEntries = Array.from(dayMap.values());
  const bestDay =
    dayEntries.length > 0
      ? dayEntries.reduce((best, day) => (day.earnings > best.earnings ? day : best))
      : null;
  const topShift =
    shiftMap.size > 0
      ? Array.from(shiftMap.values()).sort(
          (a, b) => b.count - a.count || b.earnings - a.earnings,
        )[0]
      : null;

  return {
    year,
    earnings: round2(earnings),
    minutes,
    days: dayMap.size,
    shifts: yearRecords.length,
    averageRate: minutes > 0 ? round2(earnings / (minutes / 60)) : 0,
    overtimeMinutes,
    overtimeEarnings: round2(overtimeEarnings),
    activeMonths: months.length,
    bestMonth,
    bestDay,
    longestStreak: longestStreak(yearRecords.map((record) => record.date)),
    topShift,
  };
}

/** 可分享的年度复盘文本，和工资条一样走系统分享/下载 */
export function buildAnnualReportText(
  summary: AnnualSummary,
  year = summary.year,
): string {
  const title = `工时账本 · ${year} 年度复盘`;
  if (summary.shifts === 0) {
    return [title, '', '今年还没有记录。', '', '由工时账本生成'].join('\n');
  }
  const lines = [
    title,
    '',
    `总收入：¥${formatMoney(summary.earnings)}`,
    `总工时：${formatDuration(summary.minutes)}`,
    `出勤：${summary.days} 天 · ${summary.shifts} 班`,
    `平均时薪：¥${formatMoney(summary.averageRate)}`,
  ];
  if (summary.overtimeMinutes > 0) {
    lines.push(
      `加班：${formatDuration(summary.overtimeMinutes)} · ¥${formatMoney(
        summary.overtimeEarnings,
      )}`,
    );
  }
  if (summary.bestMonth) {
    lines.push(
      `最高收入月：${summary.bestMonth.month}月 · ¥${formatMoney(
        summary.bestMonth.earnings,
      )}`,
    );
  }
  if (summary.bestDay) {
    lines.push(
      `最高单日：${formatDateCN(summary.bestDay.date)} · ¥${formatMoney(
        summary.bestDay.earnings,
      )}`,
    );
  }
  lines.push(`最长连续出勤：${summary.longestStreak} 天`);
  if (summary.topShift) {
    lines.push(`最常上的班次：${summary.topShift.name}（${summary.topShift.count} 班）`);
  }
  lines.push(`覆盖月份：${summary.activeMonths} 个月`);
  lines.push('', '由工时账本生成');
  return lines.join('\n');
}
