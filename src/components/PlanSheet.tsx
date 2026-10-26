import { useState, type CSSProperties } from 'react';
import {
  SHIFT_COLORS,
  SHIFT_COLOR_NAMES,
  type PlanInput,
  type PlannedShift,
  type ShiftTemplate,
} from '../types';
import {
  addDaysISO,
  earningsOf,
  formatDateCN,
  formatDuration,
  formatMoney,
  isOvernight,
  rawMinutes,
  repeatDatesISO,
  todayISO,
  workedMinutes,
} from '../utils';
import { BottomSheet } from './BottomSheet';
import { CalendarIcon, MoonIcon } from './Icons';
import { MultiplierOptions } from './MultiplierOptions';

interface Draft {
  date: string;
  templateId: string | null;
  shiftName: string;
  shiftColor: string;
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
  multiplier: number;
  note: string;
}

interface PlanSheetProps {
  templates: ShiftTemplate[];
  plan?: PlannedShift;
  initialDate?: string;
  defaultTemplate: ShiftTemplate | null;
  onClose: () => void;
  onSave: (input: PlanInput, dates: string[]) => void;
  onDelete?: () => void;
  escapeDisabled?: boolean;
}

const REPEAT_OPTIONS = [
  { weeks: 1, label: '不重复' },
  { weeks: 4, label: '4 周' },
  { weeks: 8, label: '8 周' },
  { weeks: 12, label: '12 周' },
];

function createDraft(
  templates: ShiftTemplate[],
  plan?: PlannedShift,
  template?: ShiftTemplate | null,
  initialDate?: string,
): Draft {
  if (plan) {
    return {
      date: plan.date,
      templateId:
        plan.templateId && templates.some((item) => item.id === plan.templateId)
          ? plan.templateId
          : null,
      shiftName: plan.shiftName,
      shiftColor: plan.shiftColor,
      start: plan.start,
      end: plan.end,
      breakMinutes: plan.breakMinutes,
      rate: plan.rate,
      multiplier: plan.multiplier,
      note: plan.note,
    };
  }
  const date = initialDate ?? todayISO();
  if (template) {
    return {
      date,
      templateId: template.id,
      shiftName: template.name,
      shiftColor: template.color,
      start: template.start,
      end: template.end,
      breakMinutes: template.breakMinutes,
      rate: template.rate,
      multiplier: 1,
      note: '',
    };
  }
  return {
    date,
    templateId: null,
    shiftName: '',
    shiftColor: SHIFT_COLORS[2],
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    rate: templates[0]?.rate ?? 20,
    multiplier: 1,
    note: '',
  };
}

export function PlanSheet({
  templates,
  plan,
  initialDate,
  defaultTemplate,
  onClose,
  onSave,
  onDelete,
  escapeDisabled = false,
}: PlanSheetProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    createDraft(templates, plan, defaultTemplate, initialDate),
  );
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const raw = rawMinutes(draft.start, draft.end);
  const minutes = workedMinutes(draft.start, draft.end, draft.breakMinutes);
  const earnings = earningsOf({
    start: draft.start,
    end: draft.end,
    breakMinutes: draft.breakMinutes,
    rate: draft.rate,
    multiplier: draft.multiplier,
  });
  const overnight = isOvernight(draft.start, draft.end);
  const isCustom = draft.templateId === null;
  const dates = plan ? [draft.date] : repeatDatesISO(draft.date, repeatWeeks);
  const lastDate = dates.at(-1) ?? draft.date;
  const error = !draft.shiftName.trim()
    ? '请填写班次名称'
    : raw === 0
      ? '开始和结束时间不能相同'
      : draft.breakMinutes >= raw
        ? '休息时长不能超过班次总时长'
        : !Number.isFinite(draft.rate) || draft.rate < 0
          ? '时薪不能为负数'
          : '';
  const valid = error === '';

  const patch = (next: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const selectTemplate = (item: ShiftTemplate) => {
    patch({
      templateId: item.id,
      shiftName: item.name,
      shiftColor: item.color,
      start: item.start,
      end: item.end,
      breakMinutes: item.breakMinutes,
      rate: item.rate,
    });
  };

  const handleSave = () => {
    if (!valid) return;
    onSave(
      {
        date: draft.date,
        templateId: draft.templateId,
        shiftName: draft.shiftName.trim(),
        shiftColor: draft.shiftColor,
        start: draft.start,
        end: draft.end,
        breakMinutes: Math.max(0, Math.round(draft.breakMinutes)),
        rate: Math.max(0, draft.rate),
        multiplier: draft.multiplier,
        note: draft.note.trim(),
      },
      dates,
    );
  };

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  return (
    <BottomSheet
      title={plan ? '编辑排班' : '排班'}
      subtitle={plan ? '改动只影响这一次排班' : '提前安排好，到点一键打卡'}
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      action={
        plan && onDelete ? (
          <button type="button" className="sheet-delete" onClick={onDelete}>
            删除
          </button>
        ) : null
      }
      footer={
        <>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="pay-preview">
            <div className="pay-preview-main">
              <span>{dates.length > 1 ? `共 ${dates.length} 班预计` : '预计收入'}</span>
              <strong>
                <small>¥</small>
                {formatMoney(earnings * dates.length)}
              </strong>
            </div>
            <span className="pay-preview-meta">
              {formatDuration(minutes)} · ¥{draft.rate}/时
              {draft.multiplier !== 1 ? ` × ${draft.multiplier}` : ''}
              {dates.length > 1 ? ` · 单班 ¥${formatMoney(earnings)}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="primary-button save-button"
            onClick={handleSave}
            disabled={!valid}
          >
            {plan ? '保存修改' : dates.length > 1 ? `保存 ${dates.length} 个排班` : '保存排班'}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="field">
          <span className="field-label">排班日期</span>
          <div className="date-row">
            <label className="date-input-wrap">
              <CalendarIcon size={18} />
              <input
                type="date"
                value={draft.date}
                onChange={(event) => {
                  if (event.target.value) patch({ date: event.target.value });
                }}
                aria-label="排班日期"
              />
            </label>
            <div className="date-quick">
              <button
                type="button"
                className={draft.date === today ? 'is-active' : ''}
                onClick={() => patch({ date: today })}
              >
                今天
              </button>
              <button
                type="button"
                className={draft.date === tomorrow ? 'is-active' : ''}
                onClick={() => patch({ date: tomorrow })}
              >
                明天
              </button>
            </div>
          </div>
        </div>

        {!plan ? (
          <div className="field">
            <span className="field-label">
              重复
              <small className="field-label-note">每周同一天</small>
            </span>
            <div className="plan-repeat-row" role="group" aria-label="选择每周重复周数">
              {REPEAT_OPTIONS.map((option) => (
                <button
                  key={option.weeks}
                  type="button"
                  className={`choice-chip${repeatWeeks === option.weeks ? ' is-active' : ''}`}
                  onClick={() => setRepeatWeeks(option.weeks)}
                  aria-pressed={repeatWeeks === option.weeks}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {repeatWeeks > 1 ? (
              <p className="plan-repeat-summary">
                每周重复，共 {dates.length} 班
                <small>
                  {formatDateCN(draft.date)} – {formatDateCN(lastDate)}
                </small>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <span className="field-label">班次</span>
          <div className="chip-row shift-chips">
            {templates.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`shift-chip${draft.templateId === item.id ? ' is-active' : ''}`}
                style={{ '--shift-color': item.color } as CSSProperties}
                onClick={() => selectTemplate(item)}
              >
                <span className="shift-dot" aria-hidden="true" />
                {item.name}
              </button>
            ))}
            <button
              type="button"
              className={`shift-chip is-custom${isCustom ? ' is-active' : ''}`}
              onClick={() => patch({ templateId: null })}
            >
              自定义
            </button>
          </div>
          {isCustom ? (
            <div className="custom-panel">
              <input
                className="text-input"
                value={draft.shiftName}
                onChange={(event) => patch({ shiftName: event.target.value })}
                placeholder="填写班次名称，如：中班"
                maxLength={12}
                aria-label="班次名称"
              />
              <div className="swatch-row compact">
                {SHIFT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`swatch${draft.shiftColor === color ? ' is-active' : ''}`}
                    style={{ '--swatch-color': color } as CSSProperties}
                    onClick={() => patch({ shiftColor: color })}
                    aria-label={`选择${SHIFT_COLOR_NAMES[color]}色`}
                    aria-pressed={draft.shiftColor === color}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="field">
          <span className="field-label">班次时间</span>
          <div className="time-row">
            <label className="time-card">
              <span>开始</span>
              <input
                type="time"
                value={draft.start}
                onChange={(event) => patch({ start: event.target.value })}
              />
            </label>
            <span className="time-arrow" aria-hidden="true">→</span>
            <label className="time-card">
              <span>
                结束
                {overnight ? <small className="overnight-tag"><MoonIcon size={11} />次日</small> : null}
              </span>
              <input
                type="time"
                value={draft.end}
                onChange={(event) => patch({ end: event.target.value })}
              />
            </label>
          </div>
          <p className="field-hint">
            {overnight
              ? '下班时间早于上班时间，已自动按跨越午夜计算'
              : raw === 0
                ? '开始和结束时间相同时无法计算工时'
                : `净工时 ${formatDuration(minutes)}（已扣除休息）`}
          </p>
        </div>

        <div className="form-grid">
          <div className="field">
            <span className="field-label">休息</span>
            <div className="stepper">
              <button
                type="button"
                onClick={() => patch({ breakMinutes: Math.max(0, draft.breakMinutes - 30) })}
                aria-label="减少 30 分钟休息"
              >
                −
              </button>
              <span className="stepper-value">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.breakMinutes}
                  onChange={(event) =>
                    patch({ breakMinutes: Math.max(0, Number(event.target.value) || 0) })
                  }
                  aria-label="休息分钟数"
                />
                <small>分</small>
              </span>
              <button
                type="button"
                onClick={() => patch({ breakMinutes: draft.breakMinutes + 30 })}
                aria-label="增加 30 分钟休息"
              >
                +
              </button>
            </div>
          </div>
          <div className="field">
            <span className="field-label">时薪</span>
            <div className="input-affix">
              <span>¥</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={draft.rate}
                onChange={(event) =>
                  patch({ rate: Math.max(0, Number(event.target.value) || 0) })
                }
                aria-label="时薪"
              />
              <span>/时</span>
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            计薪倍数
            <small className="field-label-note">加班时使用</small>
          </span>
          <MultiplierOptions
            value={draft.multiplier}
            onChange={(multiplier) => patch({ multiplier })}
          />
        </div>

        <div className="field">
          <span className="field-label">备注</span>
          <input
            className="text-input"
            value={draft.note}
            onChange={(event) => patch({ note: event.target.value })}
            placeholder="可选，如：带新人、备货"
            maxLength={40}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
