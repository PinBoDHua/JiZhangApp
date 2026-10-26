import { useState } from 'react';
import type { ActiveShift } from '../types';
import {
  activePauseMs,
  formatDateCN,
  formatDuration,
  formatMoney,
  isOvernight,
  rawMinutes,
} from '../utils';
import { BottomSheet } from './BottomSheet';
import { MoonIcon } from './Icons';
import { MultiplierOptions } from './MultiplierOptions';

interface EndTimingInput {
  breakMinutes: number;
  multiplier: number;
  note: string;
}

interface EndTimingSheetProps {
  shift: ActiveShift;
  endTime: string;
  endAt: number;
  onClose: () => void;
  onSave: (input: EndTimingInput) => void;
  escapeDisabled?: boolean;
}

export function EndTimingSheet({
  shift,
  endTime,
  endAt,
  onClose,
  onSave,
  escapeDisabled = false,
}: EndTimingSheetProps) {
  const totalMinutes = rawMinutes(shift.startTime, endTime);
  const pauseMinutes = Math.round(activePauseMs(shift, endAt) / 60_000);
  const suggestedBreak = pauseMinutes > 0 ? pauseMinutes : shift.breakMinutes;
  const maxBreak = Math.max(0, totalMinutes - 1);
  const [breakMinutes, setBreakMinutes] = useState(() => Math.min(suggestedBreak, maxBreak));
  const [multiplier, setMultiplier] = useState(shift.multiplier);
  const [note, setNote] = useState(shift.note);

  const workedMinutes = Math.max(0, totalMinutes - breakMinutes);
  const earnings =
    Math.round((workedMinutes / 60) * shift.rate * multiplier * 100) / 100;
  const valid = totalMinutes > 0 && breakMinutes >= 0 && breakMinutes < totalMinutes && multiplier > 0;
  const overnight = isOvernight(shift.startTime, endTime);

  const updateBreak = (next: number) => {
    const value = Number.isFinite(next) ? Math.round(next) : 0;
    setBreakMinutes(Math.min(Math.max(0, value), maxBreak));
  };

  return (
    <BottomSheet
      title="结束打卡"
      subtitle="确认本次工时和收入"
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      footer={
        <>
          {!valid ? <p className="form-error" role="alert">请检查休息时长</p> : null}
          <div className="pay-preview">
            <div className="pay-preview-main">
              <span>本次收入</span>
              <strong>
                <small>¥</small>
                {formatMoney(earnings)}
              </strong>
            </div>
            <span className="pay-preview-meta">
              净工时 {formatDuration(workedMinutes)} · ¥{shift.rate}/时
              {multiplier !== 1 ? ` × ${multiplier}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="save-button primary-button"
            onClick={() =>
              onSave({
                breakMinutes,
                multiplier,
                note: note.trim(),
              })
            }
            disabled={!valid}
          >
            保存记录
          </button>
        </>
      }
    >
      <div className="form">
        <div className="end-summary">
          <div className="end-summary-head">
            <span>{formatDateCN(shift.startDate)}</span>
            <span className="end-summary-tag">
              {overnight ? (
                <>
                  <MoonIcon size={11} />
                  跨夜
                </>
              ) : (
                '当天'
              )}
            </span>
          </div>
          <div className="end-summary-times">
            <strong>{shift.startTime}</strong>
            <span aria-hidden="true">→</span>
            <strong>{endTime}</strong>
            <small>在岗 {formatDuration(totalMinutes)}</small>
          </div>
          <p>
            {pauseMinutes > 0
              ? `本次共暂停 ${pauseMinutes} 分钟，已作为默认休息扣除`
              : `本次没有暂停计时，默认按班次休息 ${shift.breakMinutes} 分钟`}
          </p>
        </div>

        <div className="field">
          <span className="field-label">休息扣除</span>
          <div className="stepper">
            <button
              type="button"
              onClick={() => updateBreak(breakMinutes - 15)}
              aria-label="减少 15 分钟休息"
            >
              −
            </button>
            <span className="stepper-value">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={maxBreak}
                value={breakMinutes}
                onChange={(event) => updateBreak(Number(event.target.value))}
                aria-label="休息扣除分钟数"
              />
              <small>分</small>
            </span>
            <button
              type="button"
              onClick={() => updateBreak(breakMinutes + 15)}
              aria-label="增加 15 分钟休息"
            >
              +
            </button>
          </div>
          <p className="field-hint">如有带薪休息，可以把这里调小。</p>
        </div>

        <div className="field">
          <span className="field-label">
            计薪倍数
            <small className="field-label-note">本次结算使用</small>
          </span>
          <MultiplierOptions value={multiplier} onChange={setMultiplier} />
        </div>

        <div className="field">
          <span className="field-label">备注</span>
          <input
            className="text-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="可选，如：顶班、加班两小时"
            maxLength={40}
          />
        </div>

        <p className="end-hint">关闭本页后计时会保持暂停，可以稍后继续或再结算。</p>
      </div>
    </BottomSheet>
  );
}
