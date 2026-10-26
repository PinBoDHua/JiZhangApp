import type { ActiveShift } from '../types';
import { computePay } from '../pay';
import {
  activePauseMs,
  activeWorkedMinutes,
  formatDateCN,
  formatElapsed,
  formatMoney,
} from '../utils';
import { useClock } from '../useClock';
import { ClockIcon, CloseIcon, PauseIcon, PlayIcon, StopIcon } from './Icons';

interface ActiveTimingCardProps {
  shift: ActiveShift;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onAbandon: () => void;
}

export function ActiveTimingCard({
  shift,
  onPause,
  onResume,
  onStop,
  onAbandon,
}: ActiveTimingCardProps) {
  const { timestamp } = useClock();
  const isPaused = Boolean(shift.pausedAt);
  const wallMinutes = Math.max(0, Math.floor((timestamp - shift.startedAt) / 60_000));
  const workedMinutes = activeWorkedMinutes(shift, timestamp);
  const pauseMinutes = Math.round(activePauseMs(shift, timestamp) / 60_000);
  const suggestedBreak = pauseMinutes > 0 ? pauseMinutes : shift.breakMinutes;
  const breakMinutes = Math.min(suggestedBreak, Math.max(0, wallMinutes - 1));
  const paidMinutes = Math.max(0, wallMinutes - breakMinutes);
  const estimate = computePay({
    minutes: paidMinutes,
    rate: shift.rate,
    multiplier: shift.multiplier,
    overtime: shift.overtime,
  }).total;

  return (
    <section
      className={`active-timing${isPaused ? ' is-paused' : ''}`}
      aria-label={isPaused ? `已暂停：${shift.shiftName}` : `正在计时：${shift.shiftName}`}
    >
      <div className="active-timing-head">
        <span className="active-timing-live">
          <i aria-hidden="true" />
          {isPaused ? '已暂停' : '计时中'}
        </span>
        <span className="active-timing-start">
          {formatDateCN(shift.startDate)} {shift.startTime} 开始
        </span>
        <button
          type="button"
          className="active-timing-abandon"
          onClick={onAbandon}
          aria-label="放弃这次计时"
          title="放弃计时"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="active-timing-body">
        <div className="active-timing-info">
          <p className="active-timing-shift">
            <i style={{ backgroundColor: shift.shiftColor }} aria-hidden="true" />
            {shift.shiftName}
            {shift.sourcePlanId ? <span className="active-timing-plan">来自排班</span> : null}
          </p>
          <p className="active-timing-elapsed">{formatElapsed(workedMinutes)}</p>
          <p className="active-timing-meta">
            <ClockIcon size={12} />
            预计 ¥{formatMoney(estimate)}
            {pauseMinutes > 0
              ? ` · 已休 ${pauseMinutes} 分`
              : shift.breakMinutes > 0
                ? ` · 班次休息 ${shift.breakMinutes} 分`
                : ''}
          </p>
        </div>
        <div className="active-timing-actions">
          <button
            type="button"
            className="timing-pause-button"
            onClick={isPaused ? onResume : onPause}
          >
            {isPaused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
            {isPaused ? '继续' : '休息'}
          </button>
          <button type="button" className="timing-stop-button" onClick={onStop}>
            <StopIcon size={16} />
            结束记账
          </button>
        </div>
      </div>
    </section>
  );
}
