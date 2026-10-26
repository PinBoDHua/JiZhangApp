import type { PlannedShift, WorkRecord } from './types';
import { isPlanPast, planPay, recordPay } from './utils';

export interface MonthForecast {
  monthPrefix: string;
  recordedShifts: number;
  recordedMinutes: number;
  recordedEarnings: number;
  recordedDays: number;
  upcomingPlans: number;
  upcomingMinutes: number;
  upcomingEarnings: number;
  upcomingDays: number;
  projectedMinutes: number;
  projectedEarnings: number;
  goal: number;
  recordedPercent: number | null;
  projectedPercent: number | null;
  /** 距离目标还差多少（已入账口径） */
  remainingToGoal: number;
  /** 按排班预测后还差多少 */
  projectedRemaining: number;
  averageUpcomingEarning: number;
  /** 按待上排班的平均收入，还差几个班；无排班或已达成时为 null/0 */
  shiftsToGoal: number | null;
}

export interface MonthForecastInput {
  records: WorkRecord[];
  plans: PlannedShift[];
  /** YYYY-MM */
  monthPrefix: string;
  now: Date;
  goal?: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * 本月收入预测：已入账记录 + 尚未到期的排班。
 * 只统计排班结束时间晚于现在的计划，避免把漏记的旧排班重复算进预测；
 * 进行中的打卡若来自排班仍在 plans 里，会自然被算作待上。
 */
export function buildMonthForecast({
  records,
  plans,
  monthPrefix,
  now,
  goal: rawGoal = 0,
}: MonthForecastInput): MonthForecast {
  const monthRecords = records.filter((record) => record.date.startsWith(monthPrefix));
  const monthPlans = plans.filter((plan) => plan.date.startsWith(monthPrefix));
  const upcoming = monthPlans.filter((plan) => !isPlanPast(plan, now));

  let recordedMinutes = 0;
  let recordedEarnings = 0;
  monthRecords.forEach((record) => {
    const pay = recordPay(record);
    recordedMinutes += pay.minutes;
    recordedEarnings += pay.total;
  });

  let upcomingMinutes = 0;
  let upcomingEarnings = 0;
  upcoming.forEach((plan) => {
    const pay = planPay(plan);
    upcomingMinutes += pay.minutes;
    upcomingEarnings += pay.total;
  });

  const goal = Number.isFinite(rawGoal) && rawGoal > 0 ? rawGoal : 0;
  const projectedEarnings = round2(recordedEarnings + upcomingEarnings);
  const projectedMinutes = recordedMinutes + upcomingMinutes;
  const recordedPercent = goal > 0 ? round2((recordedEarnings / goal) * 100) : null;
  const projectedPercent = goal > 0 ? round2((projectedEarnings / goal) * 100) : null;
  const remainingToGoal = goal > 0 ? round2(Math.max(0, goal - recordedEarnings)) : 0;
  const projectedRemaining =
    goal > 0 ? round2(Math.max(0, goal - projectedEarnings)) : 0;
  const averageUpcomingEarning =
    upcoming.length > 0 ? round2(upcomingEarnings / upcoming.length) : 0;
  const shiftsToGoal =
    goal === 0 || projectedRemaining === 0
      ? goal > 0
        ? 0
        : null
      : averageUpcomingEarning > 0
        ? Math.ceil(projectedRemaining / averageUpcomingEarning)
        : null;

  return {
    monthPrefix,
    recordedShifts: monthRecords.length,
    recordedMinutes,
    recordedEarnings: round2(recordedEarnings),
    recordedDays: new Set(monthRecords.map((record) => record.date)).size,
    upcomingPlans: upcoming.length,
    upcomingMinutes,
    upcomingEarnings: round2(upcomingEarnings),
    upcomingDays: new Set(upcoming.map((plan) => plan.date)).size,
    projectedMinutes,
    projectedEarnings,
    goal,
    recordedPercent,
    projectedPercent,
    remainingToGoal,
    projectedRemaining,
    averageUpcomingEarning,
    shiftsToGoal,
  };
}
