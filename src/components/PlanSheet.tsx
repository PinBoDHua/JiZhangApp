import { useState } from 'react';
import {
  SHIFT_COLORS,
  type DayPayRule,
  type OvertimeRule,
  type PlanInput,
  type PlannedShift,
  type ShiftTemplate,
  FIELD_LIMITS,
} from '../types';
import {
  addDaysISO,
  formatDateCN,
  formatDuration,
  formatHours,
  formatMoney,
  rawMinutes,
  repeatDatesISO,
  shiftPay,
  todayISO,
  workedMinutes,
} from '../utils';
import { REMINDER_LEAD_OPTIONS } from '../reminders';
import { validateShiftDraft } from '../shiftDraft';
import { BottomSheet } from './BottomSheet';
import { CalendarIcon } from './Icons';
import { describeDayRule, resolveDayRule } from '../dayRule';
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
  reminderEnabled: boolean;
  reminderLeadMinutes: number | null;
}

interface PlanSheetProps {
  templates: ShiftTemplate[];
  plan?: PlannedShift;
  initialDate?: string;
  defaultTemplate: ShiftTemplate | null;
  /** 周末 / 节假日自动倍数规则 */
  dayRule?: DayPayRule;
  reminderAvailable: boolean;
  globalReminderEnabled: boolean;
  globalReminderLeadMinutes: number;
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
  dayRule?: DayPayRule,
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
      overtime: plan.overtime ?? null,
      reminderEnabled: plan.reminderEnabled !== false,
      reminderLeadMinutes: plan.reminderLeadMinutes ?? null,
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
      reminderEnabled: true,
      reminderLeadMinutes: null,
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
    multiplier: autoMultiplier,
    note: '',
    overtime: null,
    reminderEnabled: true,
    reminderLeadMinutes: null,
  };
}

export function PlanSheet({
  templates,
  plan,
  initialDate,
  defaultTemplate,
  dayRule,
  reminderAvailable,
  globalReminderEnabled,
  globalReminderLeadMinutes,
  onClose,
  onSave,
  onDelete,
  escapeDisabled = false,
}: PlanSheetProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    createDraft(templates, plan, defaultTemplate, initialDate, dayRule),
  );
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  // 编辑已有排班或用户手动改过倍数时，不再随日期自动切换
  const [multiplierTouched, setMultiplierTouched] = useState(Boolean(plan));

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
  const dayHint = multiplierTouched ? '' : describeDayRule(dayRule, draft.date);
  const globalLeadLabel =
    REMINDER_LEAD_OPTIONS.find((option) => option.minutes === globalReminderLeadMinutes)?.label ??
    `${globalReminderLeadMinutes} 分钟`;
  const dates = plan ? [draft.date] : repeatDatesISO(draft.date, repeatWeeks);
  const lastDate = dates.at(-1) ?? draft.date;
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

  /** 换日期时按当天规则带出倍数；用户手动改过则保持原值 */
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
        overtime: draft.overtime,
        reminderEnabled: draft.reminderEnabled,
        reminderLeadMinutes: draft.reminderLeadMinutes,
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
              {pay.overtimeMinutes > 0
                ? ` · 加班 ${formatHours(pay.overtimeMinutes)}h`
                : ''}
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
                  if (event.target.value) changeDate(event.target.value);
                }}
                aria-label="排班日期"
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
                className={draft.date === tomorrow ? 'is-active' : ''}
                onClick={() => changeDate(tomorrow)}
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

        <ShiftChipsField
          templates={templates}
          templateId={draft.templateId}
          shiftName={draft.shiftName}
          shiftColor={draft.shiftColor}
          onChange={patch}
        />

        <WorkTimeField
          label="班次时间"
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

        {reminderAvailable ? (
          <div className="field">
            <div className="plan-reminder-head">
              <span className="field-label">
                排班提醒
                <small className="field-label-note">
                  {globalReminderEnabled ? `默认提前 ${globalLeadLabel}` : '系统提醒未开启'}
                </small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={draft.reminderEnabled}
                aria-label="这个排班提醒"
                className={`switch${draft.reminderEnabled ? ' is-on' : ''}`}
                onClick={() => patch({ reminderEnabled: !draft.reminderEnabled })}
              >
                <span aria-hidden="true" />
              </button>
            </div>
            {draft.reminderEnabled ? (
              <div className="plan-reminder-lead" role="group" aria-label="提前提醒时间">
                <button
                  type="button"
                  className={`choice-chip${
                    draft.reminderLeadMinutes === null ? ' is-active' : ''
                  }`}
                  onClick={() => patch({ reminderLeadMinutes: null })}
                  aria-pressed={draft.reminderLeadMinutes === null}
                >
                  跟随全局
                </button>
                {REMINDER_LEAD_OPTIONS.map((option) => (
                  <button
                    key={option.minutes}
                    type="button"
                    className={`choice-chip${
                      draft.reminderLeadMinutes === option.minutes ? ' is-active' : ''
                    }`}
                    onClick={() => patch({ reminderLeadMinutes: option.minutes })}
                    aria-pressed={draft.reminderLeadMinutes === option.minutes}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="field-hint">这个排班不会发送系统通知。</p>
            )}
            {!globalReminderEnabled ? (
              <p className="field-hint">系统提醒总开关未开启，可在设置中开启。</p>
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <span className="field-label">备注</span>
          <input
            className="text-input"
            value={draft.note}
            onChange={(event) => patch({ note: event.target.value })}
            placeholder="可选，如：带新人、备货"
            maxLength={FIELD_LIMITS.note}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
