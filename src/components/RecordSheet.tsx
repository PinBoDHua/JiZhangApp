import { useState, type CSSProperties } from 'react';
import {
  SHIFT_COLORS,
  SHIFT_COLOR_NAMES,
  type PlannedShift,
  type RecordInput,
  type ShiftTemplate,
  type WorkRecord,
} from '../types';
import {
  addDaysISO,
  earningsOf,
  formatDateCN,
  formatDuration,
  formatMoney,
  isOvernight,
  rawMinutes,
  todayISO,
  workedMinutes,
} from '../utils';
import { BottomSheet } from './BottomSheet';
import { CalendarIcon, CopyIcon, MoonIcon } from './Icons';
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

interface RecordSheetProps {
  templates: ShiftTemplate[];
  record?: WorkRecord;
  plan?: PlannedShift;
  template?: ShiftTemplate | null;
  initialDate?: string;
  recentRecord?: WorkRecord | null;
  onClose: () => void;
  onSave: (input: RecordInput) => void;
  onDelete?: () => void;
  escapeDisabled?: boolean;
}

function createDraft(
  templates: ShiftTemplate[],
  record?: WorkRecord,
  plan?: PlannedShift,
  template?: ShiftTemplate | null,
  initialDate?: string,
): Draft {
  if (record) {
    return {
      date: record.date,
      templateId:
        record.templateId && templates.some((item) => item.id === record.templateId)
          ? record.templateId
          : null,
      shiftName: record.shiftName,
      shiftColor: record.shiftColor,
      start: record.start,
      end: record.end,
      breakMinutes: record.breakMinutes,
      rate: record.rate,
      multiplier: record.multiplier,
      note: record.note,
    };
  }
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
    shiftColor: SHIFT_COLORS[3],
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    rate: templates[0]?.rate ?? 20,
    multiplier: 1,
    note: '',
  };
}

export function RecordSheet({
  templates,
  record,
  plan,
  template,
  initialDate,
  recentRecord,
  onClose,
  onSave,
  onDelete,
  escapeDisabled = false,
}: RecordSheetProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    createDraft(templates, record, plan, template, initialDate),
  );

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
  const lockedToPlan = Boolean(plan && !record);
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

  const applyRecentRecord = () => {
    if (!recentRecord) return;
    const matchingTemplate = recentRecord.templateId
      ? templates.find((item) => item.id === recentRecord.templateId)
      : undefined;
    patch({
      templateId: matchingTemplate ? recentRecord.templateId : null,
      shiftName: recentRecord.shiftName,
      shiftColor: recentRecord.shiftColor,
      start: recentRecord.start,
      end: recentRecord.end,
      breakMinutes: recentRecord.breakMinutes,
      rate: recentRecord.rate,
      multiplier: recentRecord.multiplier,
      note: recentRecord.note,
    });
  };

  const handleSave = () => {
    if (!valid) return;
    onSave({
      date: lockedToPlan && plan ? plan.date : draft.date,
      templateId: draft.templateId,
      shiftName: draft.shiftName.trim(),
      shiftColor: draft.shiftColor,
      start: draft.start,
      end: draft.end,
      breakMinutes: Math.max(0, Math.round(draft.breakMinutes)),
      rate: Math.max(0, draft.rate),
      multiplier: draft.multiplier,
      note: draft.note.trim(),
    });
  };

  const today = todayISO();
  const yesterday = addDaysISO(today, -1);

  return (
    <BottomSheet
      title={record ? '编辑记录' : plan ? '记这一班' : '记一班'}
      subtitle={
        record
          ? '改动后会重新计算收入'
          : plan
            ? '确认实际工时，保存后转为记录'
            : '填好时间与时薪，收入自动算'
      }
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      action={
        record && onDelete ? (
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
              <span>预计收入</span>
              <strong>
                <small>¥</small>
                {formatMoney(earnings)}
              </strong>
            </div>
            <span className="pay-preview-meta">
              {formatDuration(minutes)} · ¥{draft.rate}/时
              {draft.multiplier !== 1 ? ` × ${draft.multiplier}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="primary-button save-button"
            onClick={handleSave}
            disabled={!valid}
          >
            {record ? '保存修改' : '保存记录'}
          </button>
        </>
      }
    >
      <div className="form">
        {!lockedToPlan ? (
          <div className="field">
            <span className="field-label">日期</span>
            <div className="date-row">
              <label className="date-input-wrap">
                <CalendarIcon size={18} />
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => {
                    if (event.target.value) patch({ date: event.target.value });
                  }}
                  aria-label="工作日期"
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
                  className={draft.date === yesterday ? 'is-active' : ''}
                  onClick={() => patch({ date: yesterday })}
                >
                  昨天
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!record && plan ? (
          <div className="plan-source-note">
            <CalendarIcon size={16} />
            <span>
              来自 {formatDateCN(plan.date)} 的排班
              <small>保存后，这个排班会标记为已完成</small>
            </span>
          </div>
        ) : null}

        {!record && !plan && recentRecord ? (
          <button type="button" className="reuse-latest" onClick={applyRecentRecord}>
            <span className="reuse-latest-icon">
              <CopyIcon size={16} />
            </span>
            <span className="reuse-latest-main">
              <strong>复制上一班</strong>
              <small>
                {recentRecord.shiftName} · {formatDateCN(recentRecord.date)} · ¥
                {recentRecord.rate}/时
                {recentRecord.multiplier !== 1 ? ` ×${recentRecord.multiplier}` : ''}
              </small>
            </span>
            <span className="reuse-latest-action">填入</span>
          </button>
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
          <span className="field-label">工作时间</span>
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
                  onChange={(event) => patch({ breakMinutes: Math.max(0, Number(event.target.value) || 0) })}
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
                onChange={(event) => patch({ rate: Math.max(0, Number(event.target.value) || 0) })}
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
            placeholder="可选，如：顶班、加班两小时"
            maxLength={40}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
