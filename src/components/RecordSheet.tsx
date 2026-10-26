import { useState } from 'react';
import {
  SHIFT_COLORS,
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
  rawMinutes,
  todayISO,
  workedMinutes,
} from '../utils';
import { validateShiftDraft } from '../shiftDraft';
import { BottomSheet } from './BottomSheet';
import { CalendarIcon, CopyIcon } from './Icons';
import {
  BreakRateField,
  MultiplierField,
  ShiftChipsField,
  WorkTimeField,
} from './ShiftFormFields';

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
  const lockedToPlan = Boolean(plan && !record);
  const error = validateShiftDraft(draft, raw);
  const valid = error === '';

  const patch = (next: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
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

        <ShiftChipsField
          templates={templates}
          templateId={draft.templateId}
          shiftName={draft.shiftName}
          shiftColor={draft.shiftColor}
          onChange={patch}
        />

        <WorkTimeField
          label="工作时间"
          start={draft.start}
          end={draft.end}
          breakMinutes={draft.breakMinutes}
          onChange={patch}
        />

        <BreakRateField
          breakMinutes={draft.breakMinutes}
          rate={draft.rate}
          totalMinutes={raw}
          onChange={patch}
        />

        <MultiplierField
          value={draft.multiplier}
          onChange={(multiplier) => patch({ multiplier })}
          note="加班时使用"
        />

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
