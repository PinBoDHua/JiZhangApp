import type { MonthForecast } from '../forecast';
import { formatDuration, formatMoney } from '../utils';

interface ForecastCardProps {
  forecast: MonthForecast;
  monthLabel: string;
}

/**
 * 月度收入预测：把「已入账」和「待上排班」拆开展示，
 * 有目标时同时画出已入账进度和排班预计能补上的部分。
 */
export function ForecastCard({ forecast, monthLabel }: ForecastCardProps) {
  const hasGoal = forecast.goal > 0;
  const recordedWidth = Math.min(100, Math.max(0, forecast.recordedPercent ?? 0));
  const projectedWidth = Math.min(
    100 - recordedWidth,
    Math.max(0, (forecast.projectedPercent ?? 0) - recordedWidth),
  );
  const goalReached = forecast.projectedRemaining === 0;
  const recordedReached = hasGoal && forecast.recordedEarnings >= forecast.goal;

  return (
    <section className="panel forecast-panel" aria-label={`${monthLabel}收入预测`}>
      <div className="panel-head">
        <div>
          <h2>收入预测</h2>
          <p>
            {monthLabel} · 已入账 + 待上 {forecast.upcomingPlans} 班
          </p>
        </div>
        <span className="forecast-badge">预计</span>
      </div>

      <p className="forecast-amount">
        <span>¥</span>
        {formatMoney(forecast.projectedEarnings)}
      </p>

      <div className="forecast-split">
        <div className="forecast-split-item">
          <span>已入账</span>
          <strong>¥{formatMoney(forecast.recordedEarnings)}</strong>
          <small>
            {forecast.recordedShifts} 班 · {formatDuration(forecast.recordedMinutes)}
          </small>
        </div>
        <div className="forecast-split-item is-upcoming">
          <span>待上 {forecast.upcomingPlans} 班</span>
          <strong>¥{formatMoney(forecast.upcomingEarnings)}</strong>
          <small>{formatDuration(forecast.upcomingMinutes)}</small>
        </div>
      </div>

      {hasGoal ? (
        <div className={`forecast-goal${goalReached ? ' is-done' : ''}`}>
          <div className="forecast-goal-head">
            <span>月目标 ¥{formatMoney(forecast.goal)}</span>
            <strong>{Math.round(forecast.projectedPercent ?? 0)}%</strong>
          </div>
          <div className="forecast-goal-bar" aria-hidden="true">
            <span style={{ width: `${recordedWidth}%` }} />
            {projectedWidth > 0 ? (
              <i
                style={{
                  left: `${recordedWidth}%`,
                  width: `${projectedWidth}%`,
                }}
              />
            ) : null}
          </div>
          <p>
            {recordedReached
              ? '目标已达成'
              : goalReached
                ? `按排班预计可达标，超出 ¥${formatMoney(
                    forecast.projectedEarnings - forecast.goal,
                  )}`
                : forecast.shiftsToGoal !== null
                  ? `还差 ¥${formatMoney(forecast.projectedRemaining)}，约 ${forecast.shiftsToGoal} 班`
                  : `还差 ¥${formatMoney(forecast.projectedRemaining)}`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
