import { useMemo, useState } from 'react';
import { buildPlanReconciliation } from '../planStats';
import { buildMonthForecast } from '../forecast';
import { useClock } from '../useClock';
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
  formatDuration,
  formatHours,
  formatMoney,
  getWeekRange,
  monthKey,
  monthLabel,
  shiftMonth,
  summarizeRecords,
  toISODate,
  type RecordsSummary,
} from '../utils';
import {
  buildBreakdown,
  buildChartPoints,
  pickActivePoint,
  pickDefaultKey,
  resolveRange,
  type BreakdownItem,
  type ChartPoint,
  type StatsRange,
} from '../statsRange';
import { AnimatedValue } from './AnimatedValue';
import { RangeSwitcher } from './RangeSwitcher';
import { ForecastCard } from './ForecastCard';
import { YearReview } from './YearReview';
import { TargetIcon } from './Icons';
import { SettlementCard } from './SettlementCard';
import { IncomeChart } from './stats/IncomeChart';
import { PlanReconcilePanel } from './stats/PlanReconcilePanel';
import { ShiftBreakdown } from './stats/ShiftBreakdown';

interface StatsProps {
  records: WorkRecord[];
  plans: PlannedShift[];
  planHistory: PlanHistoryEntry[];
  activePlanId: string | null;
  monthlyGoal: number;
  settlements: MonthlySettlement[];
  onOpenSettlement: (context: SettlementOpenContext) => void;
  onOpenMissed: () => void;
  onExportAnnualReport?: (text: string, year: number) => void;
  initialPeriod?: StatsPeriod;
  onPeriodChange?: (period: StatsPeriod) => void;
}

const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '今年' },
];

interface PeriodView {
  range: StatsRange;
  summary: RecordsSummary;
  chartPoints: ChartPoint[];
  breakdownItems: BreakdownItem[];
}

export function Stats({
  records,
  plans,
  planHistory,
  activePlanId,
  monthlyGoal,
  settlements,
  onOpenSettlement,
  onOpenMissed,
  onExportAnnualReport,
  initialPeriod = 'month',
  onPeriodChange,
}: StatsProps) {
  const { date: current } = useClock();
  const today = toISODate(current);
  const currentWeekStart = getWeekRange(today).start;
  const currentYear = Number(today.slice(0, 4));
  const currentMonthIndex = Number(today.slice(5, 7)) - 1;
  const [period, setPeriod] = useState<StatsPeriod>(initialPeriod);
  const [monthAnchor, setMonthAnchor] = useState(() => ({
    year: currentYear,
    monthIndex: currentMonthIndex,
  }));
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [yearAnchor, setYearAnchor] = useState(currentYear);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  /** 与分钟对齐的 now：预测与对账都只关心「现在到没到点」，不必按秒精度重算 */
  const now = useMemo(
    () => new Date(Math.floor(current.getTime() / 60_000) * 60_000),
    [current],
  );

  /**
   * 派生数据集中在这里算：
   * 依赖全部是原始值或稳定的 props，翻月/换周期才重算。
   */
  const view = useMemo<PeriodView>(() => {
    const range = resolveRange({
      period,
      records,
      today,
      currentWeekStart,
      weekStart,
      yearAnchor,
      monthYear: monthAnchor.year,
      monthIndex: monthAnchor.monthIndex,
    });
    return {
      range,
      summary: summarizeRecords(range.records),
      chartPoints: buildChartPoints(range, period, monthAnchor.year, monthAnchor.monthIndex),
      breakdownItems: buildBreakdown(range.records),
    };
  }, [
    records,
    period,
    today,
    currentWeekStart,
    weekStart,
    yearAnchor,
    monthAnchor.year,
    monthAnchor.monthIndex,
  ]);

  const { range, summary, chartPoints, breakdownItems } = view;
  const { start: rangeStart, records: rangeRecords } = range;

  const todayKey = period === 'year' ? today.slice(0, 7) : today;
  const defaultKey = pickDefaultKey(chartPoints, todayKey);
  const activePoint = pickActivePoint(chartPoints, selectedKey, defaultKey);

  const maxEarnings = Math.max(...chartPoints.map((point) => point.earnings), 1);
  const peakEarnings = chartPoints.reduce((peak, point) => Math.max(peak, point.earnings), 0);
  const showGoal = period === 'month' && monthlyGoal > 0;
  const goalPercent = showGoal ? Math.round((summary.earnings / monthlyGoal) * 100) : 0;
  const goalRemaining = showGoal ? Math.max(0, monthlyGoal - summary.earnings) : 0;
  const rangeKey = `${period}-${rangeStart}`;

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
  const settlementMonthKey = monthKey(monthAnchor.year, monthAnchor.monthIndex);
  const monthSettlement =
    period === 'month'
      ? settlements.find((item) => item.monthKey === settlementMonthKey)
      : undefined;
  const showSettlement =
    period === 'month' && (summary.shifts > 0 || Boolean(monthSettlement));

  // 月度专属的预测与对账都比较费：一次遍历记录 + 排班，缓存到下次换月/改数据为止
  const monthForecast = useMemo(
    () =>
      period === 'month'
        ? buildMonthForecast({
            records,
            plans,
            monthPrefix: settlementMonthKey,
            now,
            goal: monthlyGoal,
          })
        : null,
    [period, records, plans, settlementMonthKey, now, monthlyGoal],
  );
  const planReconciliation = useMemo(
    () =>
      period === 'month'
        ? buildPlanReconciliation({
            plans,
            history: planHistory,
            records,
            monthPrefix: settlementMonthKey,
            now,
            activePlanId,
          })
        : null,
    [period, plans, planHistory, records, settlementMonthKey, now, activePlanId],
  );

  const showForecast = monthForecast !== null && monthForecast.upcomingPlans > 0;
  const planRatePercent =
    planReconciliation?.completionRate !== null && planReconciliation?.completionRate !== undefined
      ? Math.round(planReconciliation.completionRate * 100)
      : null;

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
      setYearAnchor(currentYear);
    } else {
      setMonthAnchor({ year: currentYear, monthIndex: currentMonthIndex });
    }
  };

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
        label={range.label}
        isCurrent={range.isCurrent}
        currentLabel={range.currentLabel}
        resetLabel={range.resetLabel}
        previousLabel={range.previousLabel}
        nextLabel={range.nextLabel}
        onPrevious={() => stepRange(-1)}
        onNext={() => stepRange(1)}
        onReset={resetRange}
        allowFuture
      />

      <section className="stats-total-card" aria-label={totalLabel}>
        <div className="stats-total-top">
          <span>{totalLabel}</span>
          <span className="stats-total-badge">{summary.shifts} 班</span>
        </div>
        <p className="stats-total-amount">
          <span>¥</span>
          <AnimatedValue value={summary.earnings} resetKey={rangeKey} />
        </p>
        <div className="stats-total-foot">
          <span>出勤 {summary.days} 天</span>
          <span className="dot-divider" aria-hidden="true" />
          <span>合计 {formatDuration(summary.minutes)}</span>
          {summary.overtimeMinutes > 0 ? (
            <>
              <span className="dot-divider" aria-hidden="true" />
              <span className="is-overtime">
                加班 {formatHours(summary.overtimeMinutes)}h · ¥
                {formatMoney(summary.overtimeEarnings)}
              </span>
            </>
          ) : null}
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
            {formatMoney(summary.averageRate)}
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
            已完成{' '}
            <AnimatedValue value={goalPercent} resetKey={rangeKey} format={Math.round} />% ·{' '}
            {goalRemaining > 0 ? `还差 ¥${formatMoney(goalRemaining)}` : '目标已达成'}
          </p>
        </section>
      ) : null}

      {showForecast && monthForecast ? (
        <ForecastCard
          forecast={monthForecast}
          monthLabel={monthLabel(monthAnchor.year, monthAnchor.monthIndex)}
        />
      ) : null}

      {planReconciliation && planReconciliation.totalPlans > 0 ? (
        <PlanReconcilePanel
          reconciliation={planReconciliation}
          ratePercent={planRatePercent}
          onOpenMissed={onOpenMissed}
        />
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
              overtimeMinutes: summary.overtimeMinutes,
              overtimeEarnings: summary.overtimeEarnings,
            })
          }
        />
      ) : null}

      <IncomeChart
        title={chartTitle}
        hint={chartHint}
        peakLabel={chartPeakLabel}
        peakEarnings={peakEarnings}
        points={chartPoints}
        activePoint={activePoint}
        maxEarnings={maxEarnings}
        activeMeta={activeMeta}
        period={period}
        rangeKey={rangeKey}
        isEmpty={rangeRecords.length === 0}
        onSelect={setSelectedKey}
      />

      {period === 'year' && onExportAnnualReport ? (
        <YearReview year={yearAnchor} records={records} onExport={onExportAnnualReport} />
      ) : null}

      <ShiftBreakdown
        items={breakdownItems}
        subtitle={breakdownSubtitle}
        emptyLabel={range.emptyLabel}
        totalEarnings={summary.earnings}
      />
    </div>
  );
}
