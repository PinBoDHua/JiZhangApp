import type { CSSProperties } from 'react';
import {
  SHIFT_COLORS,
  SHIFT_COLOR_NAMES,
  type ShiftTemplate,
} from '../types';
import { formatDuration, isOvernight, rawMinutes, workedMinutes } from '../utils';
import { MoonIcon } from './Icons';
import { MultiplierOptions } from './MultiplierOptions';
import { NumberInput } from './NumberInput';

export interface ShiftPatch {
  templateId?: string | null;
  shiftName?: string;
  shiftColor?: string;
  start?: string;
  end?: string;
  breakMinutes?: number;
  rate?: number;
}

interface ShiftChipsFieldProps {
  templates: ShiftTemplate[];
  templateId: string | null;
  shiftName: string;
  shiftColor: string;
  onChange: (patch: ShiftPatch) => void;
}

/** 班次选择：预设班次一键带出时间与时薪，或切到自定义名称和颜色 */
export function ShiftChipsField({
  templates,
  templateId,
  shiftName,
  shiftColor,
  onChange,
}: ShiftChipsFieldProps) {
  const isCustom = templateId === null;

  const selectTemplate = (template: ShiftTemplate) => {
    onChange({
      templateId: template.id,
      shiftName: template.name,
      shiftColor: template.color,
      start: template.start,
      end: template.end,
      breakMinutes: template.breakMinutes,
      rate: template.rate,
    });
  };

  return (
    <div className="field">
      <span className="field-label">班次</span>
      <div className="chip-row shift-chips">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`shift-chip${templateId === template.id ? ' is-active' : ''}`}
            style={{ '--shift-color': template.color } as CSSProperties}
            onClick={() => selectTemplate(template)}
          >
            <span className="shift-dot" aria-hidden="true" />
            {template.name}
          </button>
        ))}
        <button
          type="button"
          className={`shift-chip is-custom${isCustom ? ' is-active' : ''}`}
          onClick={() => onChange({ templateId: null })}
        >
          自定义
        </button>
      </div>
      {isCustom ? (
        <div className="custom-panel">
          <input
            className="text-input"
            value={shiftName}
            onChange={(event) => onChange({ shiftName: event.target.value })}
            placeholder="填写班次名称，如：中班"
            maxLength={12}
            aria-label="班次名称"
            aria-invalid={!shiftName.trim() || undefined}
          />
          <div className="swatch-row compact">
            {SHIFT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`swatch${shiftColor === color ? ' is-active' : ''}`}
                style={{ '--swatch-color': color } as CSSProperties}
                onClick={() => onChange({ shiftColor: color })}
                aria-label={`选择${SHIFT_COLOR_NAMES[color]}色`}
                aria-pressed={shiftColor === color}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface WorkTimeFieldProps {
  label: string;
  start: string;
  end: string;
  breakMinutes: number;
  onChange: (patch: ShiftPatch) => void;
}

/** 起止时间，跨午夜自动按次日计算 */
export function WorkTimeField({
  label,
  start,
  end,
  breakMinutes,
  onChange,
}: WorkTimeFieldProps) {
  const overnight = isOvernight(start, end);
  const raw = rawMinutes(start, end);
  const minutes = workedMinutes(start, end, breakMinutes);

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="time-row">
        <label className="time-card">
          <span>开始</span>
          <input
            type="time"
            value={start}
            onChange={(event) => onChange({ start: event.target.value })}
            aria-invalid={raw === 0 || undefined}
          />
        </label>
        <span className="time-arrow" aria-hidden="true">→</span>
        <label className="time-card">
          <span>
            结束
            {overnight ? (
              <small className="overnight-tag">
                <MoonIcon size={11} />次日
              </small>
            ) : null}
          </span>
          <input
            type="time"
            value={end}
            onChange={(event) => onChange({ end: event.target.value })}
            aria-invalid={raw === 0 || undefined}
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
  );
}

interface BreakRateFieldProps {
  breakMinutes: number;
  rate: number;
  totalMinutes: number;
  step?: number;
  onChange: (patch: ShiftPatch) => void;
}

/** 休息时长与时薪并排输入 */
export function BreakRateField({
  breakMinutes,
  rate,
  totalMinutes,
  step = 30,
  onChange,
}: BreakRateFieldProps) {
  return (
    <div className="form-grid">
      <div className="field">
        <span className="field-label">休息</span>
        <div className="stepper">
          <button
            type="button"
            onClick={() => onChange({ breakMinutes: Math.max(0, breakMinutes - step) })}
            aria-label={`减少 ${step} 分钟休息`}
          >
            −
          </button>
          <span className="stepper-value">
            <NumberInput
              inputMode="numeric"
              min={0}
              value={breakMinutes}
              onChange={(next) => onChange({ breakMinutes: next })}
              ariaLabel="休息分钟数"
              invalid={totalMinutes > 0 && breakMinutes >= totalMinutes}
            />
            <small>分</small>
          </span>
          <button
            type="button"
            onClick={() => onChange({ breakMinutes: breakMinutes + step })}
            aria-label={`增加 ${step} 分钟休息`}
          >
            +
          </button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">时薪</span>
        <div className="input-affix">
          <span>¥</span>
          <NumberInput
            inputMode="decimal"
            min={0}
            value={rate}
            onChange={(next) => onChange({ rate: next })}
            ariaLabel="时薪"
          />
          <span>/时</span>
        </div>
      </div>
    </div>
  );
}

interface MultiplierFieldProps {
  value: number;
  onChange: (value: number) => void;
  note?: string;
}

/** 计薪倍数选择 */
export function MultiplierField({ value, onChange, note }: MultiplierFieldProps) {
  return (
    <div className="field">
      <span className="field-label">
        计薪倍数
        {note ? <small className="field-label-note">{note}</small> : null}
      </span>
      <MultiplierOptions value={value} onChange={onChange} />
    </div>
  );
}
