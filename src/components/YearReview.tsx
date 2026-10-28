import { useMemo, useState } from 'react';
import {
  buildAnnualDays,
  buildAnnualReportText,
  buildAnnualSummary,
  buildYearHeatmap,
} from '../annual';
import type { WorkRecord } from '../types';
import { AnimatedValue } from './AnimatedValue';
import {
  formatDateCN,
  formatDuration,
  formatHours,
  formatMoney,
} from '../utils';

interface YearReviewProps {
  year: number;
  records: WorkRecord[];
  onExport: (text: string, year: number) => void;
}

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);

function heatLevel(earnings: number, maxEarnings: number): number {
  if (earnings <= 0 || maxEarnings <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((earnings / maxEarnings) * 4)));
}

/** 年度复盘：摘要、12×31 热力图、年度之最与报告导出 */
export function YearReview({ year, records, onExport }: YearReviewProps) {
  /**
   * 年度数据一次算完：12 个月 × 31 天的热力图与按日明细都是全量遍历，
   * 之前点选日期、金额滚动都会把它们重算一遍，年份视图因此最吃性能。
   */
  const annual = useMemo(() => {
    const days = buildAnnualDays(records, year);
    return {
      summary: buildAnnualSummary(records, year),
      heatmap: buildYearHeatmap(records, year),
      days,
      dayMap: new Map(days.map((day) => [day.date, day])),
      maxEarnings: days.reduce((max, day) => Math.max(max, day.earnings), 0),
    };
  }, [records, year]);
  const { summary, heatmap, dayMap, maxEarnings } = annual;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected =
    (selectedDate ? dayMap.get(selectedDate) : undefined) ?? summary.bestDay;

  return (
    <section className="panel year-review-panel" aria-label={`${year}年度复盘`}>
      <div className="panel-head">
        <div>
          <h2>年度复盘</h2>
          <p>{year} · 每天都是一格</p>
        </div>
        <button
          type="button"
          className="text-button year-export"
          onClick={() => onExport(buildAnnualReportText(summary, year), year)}
        >
          导出报告
        </button>
      </div>

      <div className="year-highlights">
        <div className="year-highlight">
          <span>全年收入</span>
          <strong>
            <small>¥</small>
            <AnimatedValue value={summary.earnings} resetKey={String(year)} />
          </strong>
        </div>
        <div className="year-highlight">
          <span>总工时</span>
          <strong>
            {formatHours(summary.minutes)}
            <small>h</small>
          </strong>
        </div>
        <div className="year-highlight">
          <span>出勤</span>
          <strong>
            {summary.days}
            <small>天</small>
          </strong>
        </div>
        <div className="year-highlight">
          <span>平均时薪</span>
          <strong>
            <small>¥</small>
            {formatMoney(summary.averageRate)}
          </strong>
        </div>
      </div>

      <div className="year-heatmap-scroll" key={year}>
        <div
          className="year-heatmap"
          role="grid"
          aria-label={`${year}年每日收入热力图`}
        >
          {heatmap.map((row, monthIndex) => (
            <div className="heat-row" role="row" key={MONTH_LABELS[monthIndex]}>
              <span className="heat-month" aria-hidden="true">
                {monthIndex + 1}
              </span>
              {row.map((day, dayIndex) =>
                day ? (
                  <button
                    type="button"
                    role="gridcell"
                    key={day.date}
                    className={`heat-cell level-${heatLevel(day.earnings, maxEarnings)}${
                      selected?.date === day.date ? ' is-selected' : ''
                    }`}
                    onClick={() => setSelectedDate(day.date)}
                    aria-pressed={selected?.date === day.date}
                    aria-label={`${monthIndex + 1}月${dayIndex + 1}日，${
                      day.shifts > 0
                        ? `收入 ${formatMoney(day.earnings)} 元，${day.shifts} 班`
                        : '没有记录'
                    }`}
                    title={
                      day.shifts > 0
                        ? `${formatDateCN(day.date)} · ¥${formatMoney(day.earnings)}`
                        : formatDateCN(day.date)
                    }
                  />
                ) : (
                  <span
                    key={`${monthIndex}-${dayIndex}-empty`}
                    className="heat-cell is-empty"
                    role="gridcell"
                    aria-hidden="true"
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="heat-legend" aria-hidden="true">
        <span>少</span>
        <i className="heat-cell level-0" />
        <i className="heat-cell level-1" />
        <i className="heat-cell level-2" />
        <i className="heat-cell level-3" />
        <i className="heat-cell level-4" />
        <span>多</span>
      </div>

      {selected ? (
        <div className="year-day-detail">
          <strong>{formatDateCN(selected.date)}</strong>
          {selected.shifts > 0 ? (
            <span>
              {selected.shifts} 班 · {formatDuration(selected.minutes)} · ¥
              {formatMoney(selected.earnings)}
              {selected.overtimeMinutes > 0
                ? ` · 加班 ${formatDuration(selected.overtimeMinutes)}`
                : ''}
            </span>
          ) : (
            <span>没有记录</span>
          )}
        </div>
      ) : (
        <p className="year-empty">今年还没有记录，先记下第一班吧。</p>
      )}

      <div className="year-records">
        <div className="year-record-item">
          <span>最高收入月</span>
          <strong>
            {summary.bestMonth
              ? `${summary.bestMonth.month}月 · ¥${formatMoney(summary.bestMonth.earnings)}`
              : '—'}
          </strong>
        </div>
        <div className="year-record-item">
          <span>最高单日</span>
          <strong>
            {summary.bestDay
              ? `${formatDateCN(summary.bestDay.date)} · ¥${formatMoney(
                  summary.bestDay.earnings,
                )}`
              : '—'}
          </strong>
        </div>
        <div className="year-record-item">
          <span>最长连续出勤</span>
          <strong>
            {summary.longestStreak}
            <small>天</small>
          </strong>
        </div>
        <div className="year-record-item">
          <span>最常上的班次</span>
          <strong>
            {summary.topShift
              ? `${summary.topShift.name} · ${summary.topShift.count} 班`
              : '—'}
          </strong>
        </div>
      </div>

      {summary.overtimeMinutes > 0 ? (
        <p className="year-overtime">
          全年加班 {formatDuration(summary.overtimeMinutes)} · ¥
          {formatMoney(summary.overtimeEarnings)}
          <span>覆盖 {summary.activeMonths} 个月</span>
        </p>
      ) : null}
    </section>
  );
}
