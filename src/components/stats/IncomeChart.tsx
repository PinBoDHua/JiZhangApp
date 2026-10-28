import type { CSSProperties } from 'react';
import type { StatsPeriod } from '../../types';
import type { ChartPoint } from '../../statsRange';
import { formatMoney } from '../../utils';

interface IncomeChartProps {
  title: string;
  hint: string;
  peakLabel: string;
  peakEarnings: number;
  points: ChartPoint[];
  activePoint?: ChartPoint;
  maxEarnings: number;
  /** 选中柱子的说明文字：几班、多久、多少钱 */
  activeMeta: string;
  period: StatsPeriod;
  /** 周期标识：变化时重播柱状生长动画 */
  rangeKey: string;
  isEmpty: boolean;
  onSelect: (key: string) => void;
}

/**
 * 收入柱状图。
 * 只负责画柱与交互，取数（周期、按日汇总、峰值）都在 statsRange 里算好。
 */
export function IncomeChart({
  title,
  hint,
  peakLabel,
  peakEarnings,
  points,
  activePoint,
  maxEarnings,
  activeMeta,
  period,
  rangeKey,
  isEmpty,
  onSelect,
}: IncomeChartProps) {
  return (
    <section className="panel chart-panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        <div className="chart-peak">
          <span>{peakLabel}</span>
          <strong>¥{formatMoney(peakEarnings)}</strong>
        </div>
      </div>

      <div className="chart-stage" key={rangeKey}>
        <div
          className={`bar-chart${period === 'week' ? ' is-week' : ''}${
            period === 'year' ? ' is-year' : ''
          }${isEmpty ? ' is-empty' : ''}`}
        >
          {points.map((point, index) => {
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
                onClick={() => onSelect(point.key)}
                aria-label={`${point.focusLabel}，${point.count}班，收入${formatMoney(point.earnings)}元`}
              >
                <span className="bar-fill" style={{ height: `${height}%` }} />
              </button>
            );
          })}
        </div>
        <div className="chart-axis" aria-hidden="true">
          {points.map((point) => (
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
  );
}
