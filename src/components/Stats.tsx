import { useMemo, useState, type CSSProperties } from 'react';
import { buildPlanReconciliation, type PlanReconciliation } from '../planStats';
import { buildMonthForecast, type MonthForecast } from '../forecast';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
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
  formatDateRangeCN,
  formatDuration,
  formatHours,
  formatMoney,
  getWeekRange,
  monthKey,
  monthLabel,
  pad2,
  parseISODate,
  recordPay,
  recordsInMonth,
  recordsInRange,
  shiftMonth,
  summarizeRecords,
  toISODate,
  type RecordsSummary,
} from '../utils';
import { summarizeByDate } from '../overview';
import { RangeSwitcher } from './RangeSwitcher';
import { ForecastCard } from './ForecastCard';
import { YearReview } from './YearReview';
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
  onExportAnnualReport?: (text: string, year: number) => void;
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

export interface BreakdownItem {
  name: string;
  color: string;
  minutes: number;
  earnings: number;
  count: number;
}

interface RangeInput {
  period: StatsPeriod;
  records: WorkRecord[];
  today: string;
  currentWeekStart: string;
  weekStart: string;
  yearAnchor: number;
  monthYear: number;
  monthIndex: number;
}

interface StatsRange {
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
const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '今年' },
];

/** 解析当前统计周期的时间范围与对应记录 */
function resolveRange({
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
function buildChartPoints(
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
        earnings: monthTotal ? Math.round(monthTotal.earnings * 100) / 100 : 0,
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
function buildBreakdown(records: WorkRecord[]): BreakdownItem[] {
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

  /**
   * 派生数据集中在这里算：
   * 金额滚动动画会连续触发重渲染，若每次都全量重算，记录一多就会掉帧。
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
  const peakEarnings = chartPoints.reduce((peak, point) => Math.max(peak, point.earnings), 0);
  const showGoal = period === 'month' && monthlyGoal > 0;
  const goalPercent = showGoal ? Math.round((summary.earnings / monthlyGoal) * 100) : 0;
  const goalRemaining = showGoal ? Math.max(0, monthlyGoal - summary.earnings) : 0;
  const rangeKey = `${period}-${rangeStart}`;
  const shownEarnings = useAnimatedNumber(summary.earnings, { resetKey: rangeKey });
  const shownGoalPercent = Math.round(
    useAnimatedNumber(goalPercent, { resetKey: rangeKey }),
  );

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

  const monthForecast: MonthForecast | null =
    period === 'month'
      ? buildMonthForecast({
          records,
          plans,
          monthPrefix: settlementMonthKey,
          now: current,
          goal: monthlyGoal,
        })
      : null;
  const showForecast = monthForecast !== null && monthForecast.upcomingPlans > 0;
  const planReconciliation: PlanReconciliation | null =
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
          {formatMoney(shownEarnings)}
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
            已完成 {shownGoalPercent}% ·{' '}
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
              overtimeMinutes: summary.overtimeMinutes,
              overtimeEarnings: summary.overtimeEarnings,
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

        <div className="chart-stage" key={`${period}-${rangeStart}`}>
          <div
            className={`bar-chart${period === 'week' ? ' is-week' : ''}${
              period === 'year' ? ' is-year' : ''
            }${rangeRecords.length === 0 ? ' is-empty' : ''}`}
          >
            {chartPoints.map((point, index) => {
              const height =
                point.earnings > 0 ? Math.max(8, (point.earnings / maxEarnings) * 100) : 3;
              return (
                <button
                  key={point.key}
                  type="button"
                  className={`bar-col${point.key === activePoint?.key ? ' is-active' : ''}${
                    point.count > 0 ? ' has-data' : ''
                  }`}
                  style={{ '--bar-index': Math.min(index, 30) } as CSSProperties}
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
        </div>
        <div className="chart-focus">
          <span className="chart-focus-date" key={`${activePoint?.key}-date`}>
            {activePoint?.focusLabel ?? ''}
          </span>
          <span className="chart-focus-meta" key={`${activePoint?.key}-meta`}>
            {activeMeta}
          </span>
        </div>
      </section>

      {period === 'year' && onExportAnnualReport ? (
        <YearReview
          year={yearAnchor}
          records={records}
          onExport={onExportAnnualReport}
        />
      ) : null}

      <section className="panel breakdown-panel">
        <div className="panel-head">
          <div>
            <h2>班次构成</h2>
            <p>{breakdownSubtitle}</p>
          </div>
        </div>
        {breakdownItems.length === 0 ? (
          <div className="small-empty">
            <p>{range.emptyLabel}还没有班次记录</p>
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
