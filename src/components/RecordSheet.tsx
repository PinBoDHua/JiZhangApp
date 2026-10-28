import { useState } from 'react';
import {
  SHIFT_COLORS,
  type DayPayRule,
  type OvertimeRule,
  type PlannedShift,
  type RecordInput,
  type ShiftTemplate,
  type WorkRecord,
  FIELD_LIMITS,
} from '../types';
import { describeDayRule, resolveDayRule } from '../dayRule';
import {
  addDaysISO,
  formatDateCN,
  formatDuration,
  formatHours,
  formatMoney,
  rawMinutes,
  shiftPay,
  todayISO,
  workedMinutes,
} from '../utils';
import { validateShiftDraft } from '../shiftDraft';
import { BottomSheet } from './BottomSheet';
import { CalendarIcon, CopyIcon } from './Icons';
import {
  BreakRateField,
  MultiplierField,
  OvertimeField,
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
  overtime: OvertimeRule | null;
}

interface RecordSheetProps {
  templates: ShiftTemplate[];
  record?: WorkRecord;
  plan?: PlannedShift;
  template?: ShiftTemplate | null;
  initialDate?: string;
  recentRecord?: WorkRecord | null;
  /** 周末 / 节假日自动倍数规则；只在新建时带出，编辑历史记录不覆盖 */
  dayRule?: DayPayRule;
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
  dayRule?: DayPayRule,
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
      overtime: record.overtime ?? null,
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
      overtime: plan.overtime ?? null,
    };
  }
  const date = initialDate ?? todayISO();
  const autoMultiplier = resolveDayRule(dayRule, date).multiplier;
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
      multiplier: autoMultiplier,
      note: '',
      overtime: template.overtime ?? null,
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
    multiplier: autoMultiplier,
    note: '',
    overtime: null,
  };
}

export function RecordSheet({
  templates,
  record,
  plan,
  template,
  initialDate,
  recentRecord,
  dayRule,
  onClose,
  onSave,
  onDelete,
  escapeDisabled = false,
}: RecordSheetProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    createDraft(templates, record, plan, template, initialDate, dayRule),
  );
  // 用户手动改过倍数后，切换日期不再覆盖；编辑记录 / 排班转入时也保持原值
  const [multiplierTouched, setMultiplierTouched] = useState(
    Boolean(record || plan),
  );

  const raw = rawMinutes(draft.start, draft.end);
  const minutes = workedMinutes(draft.start, draft.end, draft.breakMinutes);
  const pay = shiftPay({
    start: draft.start,
    end: draft.end,
    breakMinutes: draft.breakMinutes,
    rate: draft.rate,
    multiplier: draft.multiplier,
    overtime: draft.overtime,
  });
  const earnings = pay.total;
  const lockedToPlan = Boolean(plan && !record);
  const dayHint = multiplierTouched ? '' : describeDayRule(dayRule, draft.date);
  const error = validateShiftDraft(draft, raw);
  const valid = error === '';

  const patch = (next: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const changeMultiplier = (multiplier: number) => {
    setMultiplierTouched(true);
    patch({
      multiplier,
      ...(draft.overtime
        ? {
            overtime: {
              ...draft.overtime,
              multiplier: Math.max(draft.overtime.multiplier, multiplier),
            },
          }
        : {}),
    });
  };

  /** 换日期时按当天规则重新带出倍数（用户手动改过就尊重用户的） */
  const changeDate = (next: string) => {
    const resolved = resolveDayRule(dayRule, next).multiplier;
    setDraft((prev) => {
      const multiplier = multiplierTouched ? prev.multiplier : resolved;
      return {
        ...prev,
        date: next,
        multiplier,
        ...(multiplierTouched || !prev.overtime
          ? {}
          : {
              overtime: {
                ...prev.overtime,
                multiplier: Math.max(prev.overtime.multiplier, multiplier),
              },
            }),
      };
    });
  };

  const applyRecentRecord = () => {
    if (!recentRecord) return;
    const matchingTemplate = recentRecord.templateId
      ? templates.find((item) => item.id === recentRecord.templateId)
      : undefined;
    setMultiplierTouched(true);
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
      overtime: recentRecord.overtime ?? null,
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
      overtime: draft.overtime,
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
              {pay.overtimeMinutes > 0
                ? ` · 加班 ${formatHours(pay.overtimeMinutes)}h`
                : ''}
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
                    if (event.target.value) changeDate(event.target.value);
                  }}
                  aria-label="工作日期"
                />
              </label>
              <div className="date-quick">
                <button
                  type="button"
                  className={draft.date === today ? 'is-active' : ''}
                  onClick={() => changeDate(today)}
                >
                  今天
                </button>
                <button
                  type="button"
                  className={draft.date === yesterday ? 'is-active' : ''}
                  onClick={() => changeDate(yesterday)}
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
          onChange={changeMultiplier}
          note={dayHint || '加班时使用'}
        />

        <OvertimeField
          value={draft.overtime}
          onChange={(overtime) => patch({ overtime })}
          minutes={minutes}
          rate={draft.rate}
          multiplier={draft.multiplier}
        />

        <div className="field">
          <span className="field-label">备注</span>
          <input
            className="text-input"
            value={draft.note}
            onChange={(event) => patch({ note: event.target.value })}
            placeholder="可选，如：顶班、加班两小时"
            maxLength={FIELD_LIMITS.note}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
