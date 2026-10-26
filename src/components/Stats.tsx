import { useState, type CSSProperties } from 'react';
import { buildPlanReconciliation } from '../planStats';
import type {
  MonthlySettlement,
  PlanHistoryEntry,
  PlannedShift,
  SettlementOpenContext,
  StatsPeriod,
  WorkRecord,
} from '../types';
import {
  addDaysISO,
  daysInMonth,
  earningsOf,
  formatDateRangeCN,
  formatDuration,
  formatHours,
  formatMoney,
  getWeekRange,
  monthKey,
  monthLabel,
  pad2,
  parseISODate,
  recordMinutes,
  recordsInMonth,
  recordsInRange,
  shiftMonth,
  summarizeRecords,
  toISODate,
} from '../utils';
import { RangeSwitcher } from './RangeSwitcher';
import { ChevronRightIcon, TargetIcon } from './Icons';
import { SettlementCard } from './SettlementCard';
import { useClock } from '../useClock';

interface StatsProps {
  records: WorkRecord[];
  plans: PlannedShift[];
  planHistory: PlanHistoryEntry[];
  activePlanId: string | null;
  monthlyGoal: number;
  settlements: MonthlySettlement[];
  onOpenSettlement: (context: SettlementOpenContext) => void;
  onOpenMissed: () => void;
  initialPeriod?: StatsPeriod;
  onPeriodChange?: (period: StatsPeriod) => void;
}

interface ChartPoint {
  key: string;
  axisLabel: string;
  earnings: number;
  minutes: number;
  count: number;
  focusLabel: string;
}

const WEEKDAY_LETTERS = ['一', '二', '三', '四', '五', '六', '日'];
const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '今年' },
];

export function Stats({
  records,
  plans,
  planHistory,
  activePlanId,
  monthlyGoal,
  settlements,
  onOpenSettlement,
  onOpenMissed,
  initialPeriod = 'month',
  onPeriodChange,
}: StatsProps) {
  const { date: current } = useClock();
  const today = toISODate(current);
  const currentWeekStart = getWeekRange(today).start;
  const [period, setPeriod] = useState<StatsPeriod>(initialPeriod);
  const [monthAnchor, setMonthAnchor] = useState({
    year: current.getFullYear(),
    monthIndex: current.getMonth(),
  });
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [yearAnchor, setYearAnchor] = useState(current.getFullYear());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  let rangeStart = '';
  let rangeEnd = '';
  let rangeRecords: WorkRecord[] = [];
  let rangeLabel = '';
  let isCurrentPeriod = false;
  let currentLabel = '本月';
  let resetLabel = '回到本月';
  let previousLabel = '上个月';
  let nextLabel = '下个月';

  if (period === 'week') {
    rangeStart = weekStart;
    rangeEnd = addDaysISO(weekStart, 6);
    rangeRecords = recordsInRange(records, rangeStart, rangeEnd);
    rangeLabel = formatDateRangeCN(rangeStart, rangeEnd);
    isCurrentPeriod = weekStart === currentWeekStart;
    currentLabel = '本周';
    resetLabel = '回到本周';
    previousLabel = '上一周';
    nextLabel = '下一周';
  } else if (period === 'year') {
    rangeStart = `${yearAnchor}-01-01`;
    rangeEnd = `${yearAnchor}-12-31`;
    rangeRecords = recordsInRange(records, rangeStart, rangeEnd);
    rangeLabel = `${yearAnchor}年`;
    isCurrentPeriod = yearAnchor === current.getFullYear();
    currentLabel = '今年';
    resetLabel = '回到今年';
    previousLabel = '上一年';
    nextLabel = '下一年';
  } else {
    rangeStart = `${monthKey(monthAnchor.year, monthAnchor.monthIndex)}-01`;
    rangeEnd = `${monthKey(monthAnchor.year, monthAnchor.monthIndex)}-${pad2(
      daysInMonth(monthAnchor.year, monthAnchor.monthIndex),
    )}`;
    rangeRecords = recordsInMonth(records, monthAnchor.year, monthAnchor.monthIndex);
    rangeLabel = monthLabel(monthAnchor.year, monthAnchor.monthIndex);
    isCurrentPeriod =
      monthAnchor.year === current.getFullYear() &&
      monthAnchor.monthIndex === current.getMonth();
  }

  const summary = summarizeRecords(rangeRecords);
  const recordsByDate = new Map<string, WorkRecord[]>();
  rangeRecords.forEach((record) => {
    const list = recordsByDate.get(record.date) ?? [];
    list.push(record);
    recordsByDate.set(record.date, list);
  });

  let chartPoints: ChartPoint[] = [];
  if (period === 'week') {
    chartPoints = Array.from({ length: 7 }, (_, index) => {
      const date = addDaysISO(rangeStart, index);
      const daySummary = summarizeRecords(recordsByDate.get(date) ?? []);
      const parsed = parseISODate(date);
      return {
        key: date,
        axisLabel: WEEKDAY_LETTERS[index],
        earnings: daySummary.earnings,
        minutes: daySummary.minutes,
        count: daySummary.shifts,
        focusLabel: `${parsed.getMonth() + 1}月${parsed.getDate()}日`,
      };
    });
  } else if (period === 'year') {
    chartPoints = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const prefix = `${yearAnchor}-${pad2(month)}`;
      const monthSummary = summarizeRecords(
        rangeRecords.filter((record) => record.date.startsWith(prefix)),
      );
      return {
        key: prefix,
        axisLabel: String(month),
        earnings: monthSummary.earnings,
        minutes: monthSummary.minutes,
        count: monthSummary.shifts,
        focusLabel: `${month}月`,
      };
    });
  } else {
    const dayCount = daysInMonth(monthAnchor.year, monthAnchor.monthIndex);
    const monthPrefix = monthKey(monthAnchor.year, monthAnchor.monthIndex);
    chartPoints = Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const date = `${monthPrefix}-${pad2(day)}`;
      const daySummary = summarizeRecords(recordsByDate.get(date) ?? []);
      const showAxis = day === 1 || day === 10 || day === 20 || day === dayCount;
      return {
        key: date,
        axisLabel: showAxis ? String(day) : '',
        earnings: daySummary.earnings,
        minutes: daySummary.minutes,
        count: daySummary.shifts,
        focusLabel: `${monthAnchor.monthIndex + 1}月${day}日`,
      };
    });
  }

  const todayKey = period === 'year' ? today.slice(0, 7) : today;
  const lastWithData = [...chartPoints].reverse().find((point) => point.count > 0)?.key;
  const defaultKey =
    chartPoints.find((point) => point.key === todayKey)?.key ??
    lastWithData ??
    chartPoints.at(-1)?.key ??
    '';
  const activePoint =
    chartPoints.find((point) => point.key === selectedKey) ??
    chartPoints.find((point) => point.key === defaultKey) ??
    chartPoints[0];

  const maxEarnings = Math.max(...chartPoints.map((point) => point.earnings), 1);
  const peakEarnings = chartPoints.reduce(
    (peak, point) => Math.max(peak, point.earnings),
    0,
  );
  const showGoal = period === 'month' && monthlyGoal > 0;
  const goalPercent = showGoal ? Math.round((summary.earnings / monthlyGoal) * 100) : 0;
  const goalRemaining = showGoal ? Math.max(0, monthlyGoal - summary.earnings) : 0;

  const chartTitle = period === 'year' ? '每月收入' : '每日收入';
  const chartHint = period === 'year' ? '轻点柱形查看当月明细' : '轻点柱形查看当天明细';
  const chartPeakLabel = period === 'year' ? '单月最高' : '单日最高';
  const totalLabel =
    period === 'week' ? '周收入合计' : period === 'year' ? '年度收入合计' : '月收入合计';
  const breakdownSubtitle =
    period === 'week'
      ? '按班次汇总本周收入'
      : period === 'year'
        ? '按班次汇总今年收入'
        : '按班次汇总本月收入';
  const emptyLabel = period === 'week' ? '本周' : period === 'year' ? '今年' : '本月';
  const settlementMonthKey = monthKey(monthAnchor.year, monthAnchor.monthIndex);
  const monthSettlement =
    period === 'month'
      ? settlements.find((item) => item.monthKey === settlementMonthKey)
      : undefined;
  const showSettlement =
    period === 'month' && (summary.shifts > 0 || Boolean(monthSettlement));
  const planReconciliation =
    period === 'month'
      ? buildPlanReconciliation({
          plans,
          history: planHistory,
          records,
          monthPrefix: settlementMonthKey,
          now: current,
          activePlanId,
        })
      : null;
  const planRatePercent =
    planReconciliation?.completionRate !== null && planReconciliation?.completionRate !== undefined
      ? Math.round(planReconciliation.completionRate * 100)
      : null;
  const planDiffClass =
    planReconciliation && planReconciliation.diffEarnings > 0
      ? 'is-up'
      : planReconciliation && planReconciliation.diffEarnings < 0
        ? 'is-down'
        : 'is-even';
  const formattedDiffShifts = planReconciliation
    ? `${planReconciliation.diffShifts > 0 ? '+' : ''}${planReconciliation.diffShifts}`
    : '';
  const formattedDiffMinutes = planReconciliation
    ? `${planReconciliation.diffMinutes > 0 ? '+' : planReconciliation.diffMinutes < 0 ? '-' : ''}${formatDuration(
        Math.abs(planReconciliation.diffMinutes),
      )}`
    : '';
  const formattedDiffEarnings = planReconciliation
    ? `${planReconciliation.diffEarnings > 0 ? '+' : planReconciliation.diffEarnings < 0 ? '-' : ''}¥${formatMoney(
        Math.abs(planReconciliation.diffEarnings),
      )}`
    : '';

  const changePeriod = (next: StatsPeriod) => {
    if (next === period) return;
    setPeriod(next);
    setSelectedKey(null);
    onPeriodChange?.(next);
  };

  const stepRange = (direction: number) => {
    setSelectedKey(null);
    if (period === 'week') {
      setWeekStart((prev) => addDaysISO(prev, direction * 7));
    } else if (period === 'year') {
      setYearAnchor((prev) => prev + direction);
    } else {
      setMonthAnchor((prev) => shiftMonth(prev.year, prev.monthIndex, direction));
    }
  };

  const resetRange = () => {
    setSelectedKey(null);
    if (period === 'week') {
      setWeekStart(currentWeekStart);
    } else if (period === 'year') {
      setYearAnchor(current.getFullYear());
    } else {
      setMonthAnchor({ year: current.getFullYear(), monthIndex: current.getMonth() });
    }
  };

  const breakdown = new Map<
    string,
    { name: string; color: string; minutes: number; earnings: number; count: number }
  >();
  rangeRecords.forEach((record) => {
    const existing = breakdown.get(record.shiftName) ?? {
      name: record.shiftName,
      color: record.shiftColor,
      minutes: 0,
      earnings: 0,
      count: 0,
    };
    existing.minutes += recordMinutes(record);
    existing.earnings += earningsOf(record);
    existing.count += 1;
    breakdown.set(record.shiftName, existing);
  });
  const breakdownItems = Array.from(breakdown.values()).sort(
    (a, b) => b.earnings - a.earnings,
  );

  const activeMeta =
    activePoint && activePoint.count > 0
      ? `${activePoint.count} 班 · ${formatDuration(activePoint.minutes)} · ¥${formatMoney(activePoint.earnings)}`
      : period === 'year'
        ? '这个月没有记录'
        : '这一天没有记录';

  return (
    <div className="screen stats-screen">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">PERIOD REPORT</p>
          <h1>统计</h1>
        </div>
        <p className="page-sub">每一小时，都算数。</p>
      </header>

      <div className="segmented-control period-tabs" role="group" aria-label="统计周期">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={period === option.value ? 'is-active' : ''}
            onClick={() => changePeriod(option.value)}
            aria-pressed={period === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      <RangeSwitcher
        label={rangeLabel}
        isCurrent={isCurrentPeriod}
        currentLabel={currentLabel}
        resetLabel={resetLabel}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        onPrevious={() => stepRange(-1)}
        onNext={() => stepRange(1)}
        onReset={resetRange}
      />

      <section className="stats-total-card" aria-label={totalLabel}>
        <div className="stats-total-top">
          <span>{totalLabel}</span>
          <span className="stats-total-badge">{summary.shifts} 班</span>
        </div>
        <p className="stats-total-amount">
          <span>¥</span>
          {formatMoney(summary.earnings)}
        </p>
        <div className="stats-total-foot">
          <span>出勤 {summary.days} 天</span>
          <span className="dot-divider" aria-hidden="true" />
          <span>合计 {formatDuration(summary.minutes)}</span>
        </div>
      </section>

      <div className="stats-mini-grid">
        <div className="mini-stat-card">
          <span>总工时</span>
          <strong>
            {formatHours(summary.minutes)}
            <small>h</small>
          </strong>
        </div>
        <div className="mini-stat-card">
          <span>平均时薪</span>
          <strong>
            <small>¥</small>
            {formatMoney(Math.round(summary.averageRate * 100) / 100)}
          </strong>
        </div>
      </div>

      {showGoal ? (
        <section className="goal-progress-card" aria-label="月收入目标进度">
          <div className="goal-progress-head">
            <span>
              <TargetIcon size={15} />
              月收入目标
            </span>
            <strong>¥{formatMoney(monthlyGoal)}</strong>
          </div>
          <div className="goal-progress-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, goalPercent)}%` }} />
          </div>
          <p>
            已完成 {goalPercent}% ·{' '}
            {goalRemaining > 0 ? `还差 ¥${formatMoney(goalRemaining)}` : '目标已达成'}
          </p>
        </section>
      ) : null}

      {planReconciliation && planReconciliation.totalPlans > 0 ? (
        <section className="panel plan-reconcile-panel" aria-label="排班对账">
          <div className="panel-head">
            <div>
              <h2>排班对账</h2>
              <p>已到期计划与实际记录</p>
            </div>
            <div className="plan-reconcile-rate">
              <span>完成率</span>
              <strong>{planRatePercent !== null ? `${planRatePercent}%` : '—'}</strong>
            </div>
          </div>
          <div className="plan-reconcile-bar" aria-hidden="true">
            <span style={{ width: `${planRatePercent ?? 0}%` }} />
          </div>
          <div className="plan-reconcile-counts">
            <span>
              <strong>{planReconciliation.completed}</strong> 已完成
            </span>
            <span>
              <strong>{planReconciliation.skipped}</strong> 未上
            </span>
            <span className={planReconciliation.missed > 0 ? 'is-warning' : ''}>
              <strong>{planReconciliation.missed}</strong> 待补记
            </span>
            <span>
              <strong>{planReconciliation.upcoming}</strong> 待上
            </span>
          </div>
          {planReconciliation.due > 0 ? (
            <div className="plan-reconcile-compare">
              <div className="plan-reconcile-compare-item">
                <span>已到期计划</span>
                <strong>{planReconciliation.due} 班</strong>
                <small>
                  {formatDuration(planReconciliation.plannedDueMinutes)} · ¥
                  {formatMoney(planReconciliation.plannedDueEarnings)}
                </small>
              </div>
              <div className="plan-reconcile-compare-item">
                <span>实际记录</span>
                <strong>{planReconciliation.actualShifts} 班</strong>
                <small>
                  {formatDuration(planReconciliation.actualMinutes)} · ¥
                  {formatMoney(planReconciliation.actualEarnings)}
                </small>
              </div>
              <div className={`plan-reconcile-compare-item ${planDiffClass}`}>
                <span>差额</span>
                <strong>{formattedDiffShifts} 班</strong>
                <small>
                  {formattedDiffMinutes} · {formattedDiffEarnings}
                </small>
              </div>
            </div>
          ) : (
            <p className="plan-reconcile-empty">本月还没有已到期的排班。</p>
          )}
          {planReconciliation.missed > 0 ? (
            <button type="button" className="plan-reconcile-action" onClick={onOpenMissed}>
              <span>去处理 {planReconciliation.missed} 个待补记排班</span>
              <ChevronRightIcon size={15} />
            </button>
          ) : null}
        </section>
      ) : null}

      {showSettlement ? (
        <SettlementCard
          settlement={monthSettlement}
          baseEarnings={summary.earnings}
          monthLabel={monthLabel(monthAnchor.year, monthAnchor.monthIndex)}
          onOpen={() =>
            onOpenSettlement({
              monthKey: settlementMonthKey,
              monthLabel: monthLabel(monthAnchor.year, monthAnchor.monthIndex),
              baseEarnings: summary.earnings,
              baseMinutes: summary.minutes,
              workedDays: summary.days,
            })
          }
        />
      ) : null}

      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <h2>{chartTitle}</h2>
            <p>{chartHint}</p>
          </div>
          <div className="chart-peak">
            <span>{chartPeakLabel}</span>
            <strong>¥{formatMoney(peakEarnings)}</strong>
          </div>
        </div>

        <div
          className={`bar-chart${period === 'week' ? ' is-week' : ''}${
            period === 'year' ? ' is-year' : ''
          }${rangeRecords.length === 0 ? ' is-empty' : ''}`}
        >
          {chartPoints.map((point) => {
            const height =
              point.earnings > 0 ? Math.max(8, (point.earnings / maxEarnings) * 100) : 3;
            return (
              <button
                key={point.key}
                type="button"
                className={`bar-col${point.key === activePoint?.key ? ' is-active' : ''}${
                  point.count > 0 ? ' has-data' : ''
                }`}
                onClick={() => setSelectedKey(point.key)}
                aria-label={`${point.focusLabel}，${point.count}班，收入${formatMoney(point.earnings)}元`}
              >
                <span className="bar-fill" style={{ height: `${height}%` }} />
              </button>
            );
          })}
        </div>
        <div className="chart-axis" aria-hidden="true">
          {chartPoints.map((point) => (
            <span key={point.key}>{point.axisLabel}</span>
          ))}
        </div>
        <div className="chart-focus">
          <span className="chart-focus-date">{activePoint?.focusLabel ?? ''}</span>
          <span className="chart-focus-meta">{activeMeta}</span>
        </div>
      </section>

      <section className="panel breakdown-panel">
        <div className="panel-head">
          <div>
            <h2>班次构成</h2>
            <p>{breakdownSubtitle}</p>
          </div>
        </div>
        {breakdownItems.length === 0 ? (
          <div className="small-empty">
            <p>{emptyLabel}还没有班次记录</p>
            <span>切换周期，或从「记录」页开始记一班。</span>
          </div>
        ) : (
          <ul className="shift-breakdown">
            {breakdownItems.map((item) => {
              const share = summary.earnings > 0 ? (item.earnings / summary.earnings) * 100 : 0;
              return (
                <li key={item.name} style={{ '--shift-color': item.color } as CSSProperties}>
                  <div className="breakdown-top">
                    <span className="breakdown-name">
                      <span className="shift-dot" aria-hidden="true" />
                      {item.name}
                      <small>
                        {item.count} 班 · {formatDuration(item.minutes)}
                      </small>
                    </span>
                    <strong>¥{formatMoney(item.earnings)}</strong>
                  </div>
                  <div className="breakdown-bar">
                    <span style={{ width: `${Math.max(share, 2)}%` }} />
                  </div>
                  <span className="breakdown-share">占收入 {Math.round(share)}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
