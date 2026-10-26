import { useState, type CSSProperties } from 'react';
import { SHIFT_COLORS, SHIFT_COLOR_NAMES, type ShiftTemplate } from '../types';
import {
  formatDuration,
  isOvernight,
  rawMinutes,
  workedMinutes,
} from '../utils';
import { validateShiftDraft } from '../shiftDraft';
import { BottomSheet } from './BottomSheet';
import { NumberInput } from './NumberInput';

export interface TemplateInput {
  name: string;
  color: string;
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
}

interface TemplateSheetProps {
  template?: ShiftTemplate;
  onClose: () => void;
  onSave: (input: TemplateInput) => void;
  onDelete?: () => void;
  escapeDisabled?: boolean;
}

export function TemplateSheet({
  template,
  onClose,
  onSave,
  onDelete,
  escapeDisabled = false,
}: TemplateSheetProps) {
  const [draft, setDraft] = useState<TemplateInput>({
    name: template?.name ?? '',
    color: template?.color ?? SHIFT_COLORS[0],
    start: template?.start ?? '08:00',
    end: template?.end ?? '17:00',
    breakMinutes: template?.breakMinutes ?? 60,
    rate: template?.rate ?? 20,
  });

  const raw = rawMinutes(draft.start, draft.end);
  const worked = workedMinutes(draft.start, draft.end, draft.breakMinutes);
  const overnight = isOvernight(draft.start, draft.end);
  const error = validateShiftDraft({ ...draft, shiftName: draft.name }, raw);
  const valid = error === '';

  const patch = (next: Partial<TemplateInput>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const handleSave = () => {
    if (!valid) return;
    onSave({
      name: draft.name.trim(),
      color: draft.color,
      start: draft.start,
      end: draft.end,
      breakMinutes: Math.max(0, Math.round(draft.breakMinutes)),
      rate: Math.max(0, draft.rate),
    });
  };

  return (
    <BottomSheet
      title={template ? '编辑班次' : '新增班次'}
      subtitle="设定好时间与时薪，记账时一键带出"
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      action={
        template && onDelete ? (
          <button type="button" className="sheet-delete" onClick={onDelete}>
            删除
          </button>
        ) : null
      }
      footer={
        <>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="template-preview" style={{ '--shift-color': draft.color } as CSSProperties}>
            <span className="shift-dot" aria-hidden="true" />
            <span className="template-preview-name">{draft.name.trim() || '新班次'}</span>
            <span className="template-preview-meta">
              {draft.start} – {draft.end}
              {overnight ? ' 次日' : ''} · {formatDuration(worked)} · ¥{draft.rate}/时
            </span>
          </div>
          <button
            type="button"
            className="primary-button save-button"
            onClick={handleSave}
            disabled={!valid}
          >
            {template ? '保存修改' : '添加班次'}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="field">
          <span className="field-label">班次名称</span>
          <input
            className="text-input"
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="如：白班、夜班、中班"
            maxLength={12}
          />
        </div>

        <div className="field">
          <span className="field-label">标记颜色</span>
          <div className="swatch-row">
            {SHIFT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`swatch${draft.color === color ? ' is-active' : ''}`}
                style={{ '--swatch-color': color } as CSSProperties}
                onClick={() => patch({ color })}
                aria-label={`选择${SHIFT_COLOR_NAMES[color]}色`}
                aria-pressed={draft.color === color}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">默认工作时间</span>
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
              <span>结束</span>
              <input
                type="time"
                value={draft.end}
                onChange={(event) => patch({ end: event.target.value })}
              />
            </label>
          </div>
          <p className="field-hint">
            {overnight ? '结束时间早于开始时间，按跨越午夜计算' : '同一天内的班次直接填写起止时间'}
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
                <NumberInput
                  inputMode="numeric"
                  min={0}
                  value={draft.breakMinutes}
                  onChange={(breakMinutes) => patch({ breakMinutes })}
                  ariaLabel="休息分钟数"
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
            <span className="field-label">默认时薪</span>
            <div className="input-affix">
              <span>¥</span>
              <NumberInput
                inputMode="decimal"
                min={0}
                value={draft.rate}
                onChange={(rate) => patch({ rate })}
                ariaLabel="默认时薪"
              />
              <span>/时</span>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
