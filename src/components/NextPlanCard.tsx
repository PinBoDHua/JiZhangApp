import type { CSSProperties } from 'react';
import type { PlannedShift } from '../types';
import {
  addDaysISO,
  canStartPlan,
  formatDateCN,
  formatDuration,
  formatHours,
  formatMoney,
  parseISODate,
  planPay,
  toISODate,
  workedMinutes,
} from '../utils';
import {
  CalendarIcon,
  MoonIcon,
  NotebookIcon,
  PlayIcon,
} from './Icons';

interface NextPlanCardProps {
  plan: PlannedShift;
  upcomingCount: number;
  now: Date;
  onStart: (plan: PlannedShift) => void;
  onRecord: (plan: PlannedShift) => void;
  onEdit: (plan: PlannedShift) => void;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function planDateLabel(plan: PlannedShift, now: Date): string {
  const today = toISODate(now);
  if (plan.date === today) return '今天';
  if (plan.date === addDaysISO(today, 1)) return '明天';
  if (plan.date === addDaysISO(today, 2)) return '后天';
  return formatDateCN(plan.date);
}

export function NextPlanCard({
  plan,
  upcomingCount,
  now,
  onStart,
  onRecord,
  onEdit,
}: NextPlanCardProps) {
  const date = parseISODate(plan.date);
  const dateLabel = planDateLabel(plan, now);
  const isToday = plan.date === toISODate(now);
  const startable = canStartPlan(plan, now);
  const minutes = workedMinutes(plan.start, plan.end, plan.breakMinutes);
  const pay = planPay(plan);
  const earnings = pay.total;

  return (
    <section
      className={`next-plan-card${isToday ? ' is-today' : ''}`}
      style={{ '--shift-color': plan.shiftColor } as CSSProperties}
      aria-label={`下一班：${dateLabel} ${plan.shiftName}，${plan.start} 到 ${plan.end}`}
    >
      <div className="next-plan-head">
        <span className="next-plan-eyebrow">
          <CalendarIcon size={13} />
          下一班 · {dateLabel}
        </span>
        <div className="next-plan-head-meta">
          {upcomingCount > 1 ? <span>未来 7 天 {upcomingCount} 班</span> : null}
          <button
            type="button"
            className="next-plan-edit"
            onClick={() => onEdit(plan)}
            aria-label={`调整 ${plan.shiftName} 排班`}
          >
            调整
          </button>
        </div>
      </div>

      <div className="next-plan-body">
        <div className="next-plan-date" aria-hidden="true">
          <strong>{date.getDate()}</strong>
          <span>
            {date.getMonth() + 1}月 · {WEEKDAYS[date.getDay()]}
          </span>
        </div>
        <div className="next-plan-info">
          <p className="next-plan-name">
            <i aria-hidden="true" />
            {plan.shiftName}
            {plan.end < plan.start ? (
              <span className="next-plan-overnight">
                <MoonIcon size={10} />
                跨夜
              </span>
            ) : null}
          </p>
          <p className="next-plan-time">
            {plan.start} – {plan.end}
            <span aria-hidden="true">·</span>
            {formatDuration(minutes)}
          </p>
          <p className="next-plan-money">
            预计 <strong>¥{formatMoney(earnings)}</strong>
            {pay.overtimeMinutes > 0 ? (
              <span className="next-plan-overtime">
                含加班 {formatHours(pay.overtimeMinutes)}h
              </span>
            ) : null}
            {plan.note ? <span className="next-plan-note">{plan.note}</span> : null}
          </p>
        </div>
      </div>

      <div className="next-plan-actions">
        <button
          type="button"
          className="next-plan-start"
          onClick={() => onStart(plan)}
          disabled={!startable}
        >
          <PlayIcon size={14} />
          {startable ? '开始打卡' : '当天可打卡'}
        </button>
        <button type="button" className="next-plan-record" onClick={() => onRecord(plan)}>
          <NotebookIcon size={14} />
          记一班
        </button>
      </div>
    </section>
  );
}
