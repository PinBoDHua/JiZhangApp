import { useState, type CSSProperties } from 'react';
import {
  MAX_ROTATION_CYCLE_DAYS,
  buildRotationPreview,
  getRotationPresets,
  type RotationPreset,
  type RotationShift,
  type RotationSlot,
} from '../rotation';
import type { PlannedShift, ShiftTemplate } from '../types';
import {
  addDaysISO,
  formatDateCN,
  formatDuration,
  formatMoney,
  todayISO,
} from '../utils';
import { BottomSheet } from './BottomSheet';
import { CalendarIcon } from './Icons';

interface RotationSheetProps {
  templates: ShiftTemplate[];
  plans: PlannedShift[];
  initialDate?: string;
  onClose: () => void;
  onGenerate: (entries: RotationShift[]) => void;
  escapeDisabled?: boolean;
}

const WEEK_OPTIONS = [4, 8, 12];

export function RotationSheet({
  templates,
  plans,
  initialDate,
  onClose,
  onGenerate,
  escapeDisabled = false,
}: RotationSheetProps) {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const presets = getRotationPresets(templates);
  const initialPreset = presets[0] ?? null;
  const [startDate, setStartDate] = useState(
    initialDate && initialDate >= today ? initialDate : today,
  );
  const [weeks, setWeeks] = useState(4);
  const [cycle, setCycle] = useState<RotationSlot[]>(() => {
    if (initialPreset) return [...initialPreset.cycle];
    return templates[0] ? [templates[0].id, null] : [];
  });
  const [presetId, setPresetId] = useState<string | null>(initialPreset?.id ?? null);

  const templateById = new Map(templates.map((template) => [template.id, template]));
  const preview = buildRotationPreview(startDate, weeks, cycle, templates, plans);
  const shiftSlots = cycle.filter((slot) => slot !== null).length;
  const full = cycle.length >= MAX_ROTATION_CYCLE_DAYS;

  const error =
    templates.length === 0
      ? '请先在设置中添加班次'
      : cycle.length === 0
        ? '请先添加循环内容'
        : shiftSlots === 0
          ? '循环里至少安排一个班次'
          : startDate < today
            ? '起始日期不能早于今天'
            : preview.shifts.length === 0
              ? '所选范围都已有排班，换个起始日期试试'
              : '';

  const applyPreset = (preset: RotationPreset) => {
    setCycle([...preset.cycle]);
    setPresetId(preset.id);
  };

  const appendSlot = (slot: RotationSlot) => {
    if (full) return;
    setCycle((prev) => [...prev, slot]);
    setPresetId(null);
  };

  const removeSlot = (index: number) => {
    setCycle((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setPresetId(null);
  };

  const undoSlot = () => {
    setCycle((prev) => prev.slice(0, -1));
    setPresetId(null);
  };

  return (
    <BottomSheet
      title="轮班表"
      subtitle="按天循环批量排班，休息日自动留空"
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      footer={
        <>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="rotation-footer-hint">生成后每个排班仍可单独修改或删除</p>
          )}
          <button
            type="button"
            className="primary-button save-button"
            onClick={() => onGenerate(preview.shifts)}
            disabled={Boolean(error)}
          >
            {preview.shifts.length > 0
              ? `生成 ${preview.shifts.length} 个排班`
              : '生成排班'}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="field">
          <span className="field-label">开始日期</span>
          <div className="date-row">
            <label className="date-input-wrap">
              <CalendarIcon size={18} />
              <input
                type="date"
                value={startDate}
                min={today}
                onChange={(event) => {
                  if (event.target.value) setStartDate(event.target.value);
                }}
                aria-label="轮班表开始日期"
              />
            </label>
            <div className="date-quick">
              <button
                type="button"
                className={startDate === today ? 'is-active' : ''}
                onClick={() => setStartDate(today)}
              >
                今天
              </button>
              <button
                type="button"
                className={startDate === tomorrow ? 'is-active' : ''}
                onClick={() => setStartDate(tomorrow)}
              >
                明天
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            轮班规则
            <small className="field-label-note">
              {presetId ? '预设循环' : cycle.length > 0 ? '自定义循环' : '按天循环'}
            </small>
          </span>
          {presets.length > 0 ? (
            <div className="rotation-presets" role="group" aria-label="选择轮班预设">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`rotation-preset${presetId === preset.id ? ' is-active' : ''}`}
                  onClick={() => applyPreset(preset)}
                  aria-pressed={presetId === preset.id}
                >
                  <span>{preset.name}</span>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
          ) : null}

          <div className="rotation-cycle-head">
            <span className="field-label">
              循环顺序
              <small className="field-label-note">
                共 {cycle.length} 天 · 点按可移除
              </small>
            </span>
            {cycle.length > 0 ? (
              <button type="button" className="text-button" onClick={undoSlot}>
                撤销
              </button>
            ) : null}
          </div>

          {cycle.length > 0 ? (
            <div className="rotation-cycle" aria-label="轮班循环顺序">
              {cycle.map((slot, index) => {
                const template = slot ? templateById.get(slot) : null;
                return (
                  <button
                    key={`${index}-${slot ?? 'rest'}`}
                    type="button"
                    className={`rotation-day${template ? '' : ' is-rest'}`}
                    style={
                      template
                        ? ({ '--shift-color': template.color } as CSSProperties)
                        : undefined
                    }
                    onClick={() => removeSlot(index)}
                    aria-label={`第 ${index + 1} 天 ${
                      template ? template.name : '休息'
                    }，点按移除`}
                  >
                    <span className="rotation-day-index">D{index + 1}</span>
                    <span className="rotation-day-name">
                      {template ? template.name : '休息'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="field-hint">用下面的班次和休息日组合一个循环。</p>
          )}

          <div className="rotation-add-row">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rotation-add-chip"
                style={{ '--shift-color': template.color } as CSSProperties}
                onClick={() => appendSlot(template.id)}
                disabled={full}
              >
                <span className="shift-dot" aria-hidden="true" />
                {template.name}
              </button>
            ))}
            <button
              type="button"
              className="rotation-add-chip is-rest"
              onClick={() => appendSlot(null)}
              disabled={full}
            >
              休息
            </button>
          </div>
          <p className="field-hint">
            {full
              ? `一个循环最多 ${MAX_ROTATION_CYCLE_DAYS} 天`
              : '点按添加到循环末尾，休息日不会生成排班。'}
          </p>
        </div>

        <div className="field">
          <span className="field-label">
            生成范围
            <small className="field-label-note">从开始日期连续生成</small>
          </span>
          <div className="plan-repeat-row" role="group" aria-label="选择生成周数">
            {WEEK_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`choice-chip${weeks === option ? ' is-active' : ''}`}
                onClick={() => setWeeks(option)}
                aria-pressed={weeks === option}
              >
                {option} 周
              </button>
            ))}
          </div>
          <p className="field-hint">
            连续 {weeks} 周，共 {preview.totalDays} 天
            {preview.skipped.length > 0
              ? `；${preview.skipped.length} 天已有排班会自动跳过`
              : '。'}
          </p>
        </div>

        <div className="rotation-summary">
          <div className="rotation-summary-top">
            <span>
              预计生成 <strong>{preview.shifts.length}</strong> 个排班
            </span>
            <strong>
              <small>¥</small>
              {formatMoney(preview.earnings)}
            </strong>
          </div>
          <div className="rotation-summary-meta">
            <span>{formatDateCN(startDate)} 起</span>
            <span className="dot-divider" aria-hidden="true" />
            <span>休息 {preview.restDays} 天</span>
            <span className="dot-divider" aria-hidden="true" />
            <span>{formatDuration(preview.minutes)}</span>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
