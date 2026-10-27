import { useState } from 'react';
import type {
  DayPayRule,
  PlannedShift,
  ShiftTemplate,
  WorkRecord,
} from '../types';
import {
  batchRangeDays,
  buildBatchRecords,
  enumerateBatchDates,
  MAX_BATCH_DAYS,
  planBatchDates,
  summarizeBatch,
  type BatchDraft,
  type RecordDraft,
} from '../batch';
import { formatMultiplier } from '../dayRule';
import {
  addDaysISO,
  formatDateCN,
  formatDuration,
  formatMoney,
  rawMinutes,
  todayISO,
} from '../utils';
import { validateShiftDraft } from '../shiftDraft';
import { BottomSheet } from './BottomSheet';
import { InfoIcon } from './Icons';
import {
  BreakRateField,
  MultiplierField,
  ShiftChipsField,
  WorkTimeField,
} from './ShiftFormFields';

interface BatchRecordSheetProps {
  templates: ShiftTemplate[];
  records: WorkRecord[];
  plans: PlannedShift[];
  defaultTemplate: ShiftTemplate | null;
  initialDate?: string;
  dayRule?: DayPayRule;
  onClose: () => void;
  /** records 已按天生成；planIds 是「日期 → 排班 id」，用于把对应排班标记完成 */
  onGenerate: (records: RecordDraft[], planIds: Record<string, string>) => void;
  escapeDisabled?: boolean;
}

const WEEKDAY_OPTIONS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
];

const ALL_WEEKDAYS = WEEKDAY_OPTIONS.map((option) => option.value);

function createDraft(
  templates: ShiftTemplate[],
  template: ShiftTemplate | null,
): BatchDraft {
  if (template) {
    return {
      templateId: template.id,
      shiftName: template.name,
      shiftColor: template.color,
      start: template.start,
      end: template.end,
      breakMinutes: template.breakMinutes,
      rate: template.rate,
      note: '',
      overtime: template.overtime ?? null,
      multiplier: null,
    };
  }
  return {
    templateId: null,
    shiftName: '',
    shiftColor: '#D45A3C',
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    rate: templates[0]?.rate ?? 20,
    note: '',
    overtime: null,
    multiplier: null,
  };
}

export function BatchRecordSheet({
  templates,
  records,
  plans,
  defaultTemplate,
  initialDate,
  dayRule,
  onClose,
  onGenerate,
  escapeDisabled = false,
}: BatchRecordSheetProps) {
  const today = todayISO();
  const [draft, setDraft] = useState<BatchDraft>(() =>
    createDraft(templates, defaultTemplate),
  );
  // 默认补最近 7 天，覆盖「补一整周」的高频场景
  const [startDate, setStartDate] = useState(initialDate ?? addDaysISO(today, -6));
  const [endDate, setEndDate] = useState(initialDate ?? today);
  const [weekdays, setWeekdays] = useState<number[]>(ALL_WEEKDAYS);
  // 默认按每天的日期规则自动取倍数；手动选择后所有日期统一
  const [autoMultiplier, setAutoMultiplier] = useState(true);
  const [manualMultiplier, setManualMultiplier] = useState(1);

  const raw = rawMinutes(draft.start, draft.end);
  const error = validateShiftDraft(draft, raw);
  const rangeDays = batchRangeDays(startDate, endDate);
  const dates = enumerateBatchDates(startDate, endDate, weekdays);
  const slots = planBatchDates(dates, records, plans);
  const freeSlots = slots.filter((slot) => slot.status === 'free');
  const freeDates = freeSlots.map((slot) => slot.date);
  const skipped = slots.length - freeSlots.length;
  const effectiveDraft: BatchDraft = {
    ...draft,
    multiplier: autoMultiplier ? null : manualMultiplier,
  };
  const totals = summarizeBatch(freeDates, effectiveDraft, dayRule);
  const canSave = error === '' && freeDates.length > 0;

  const patch = (next: Partial<BatchDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const toggleWeekday = (value: number) => {
    setWeekdays((prev) =>
      prev.includes(value)
        ? prev.filter((day) => day !== value)
        : [...prev, value].sort((a, b) => a - b),
    );
  };

  const handleSave = () => {
    if (!canSave) return;
    const planIds: Record<string, string> = {};
    freeSlots.forEach((slot) => {
      if (slot.plan) planIds[slot.date] = slot.plan.id;
    });
    onGenerate(buildBatchRecords(freeDates, effectiveDraft, dayRule), planIds);
  };

  return (
    <BottomSheet
      title="批量补记"
      subtitle="选一段时间，把漏掉的班一次补齐"
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      footer={
        <>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pay-preview">
            <div className="pay-preview-main">
              <span>预计补记</span>
              <strong>
                <small>¥</small>
                {formatMoney(totals.earnings)}
              </strong>
            </div>
            <span className="pay-preview-meta">
              {freeDates.length} 天 · {formatDuration(totals.minutes)}
              {skipped > 0 ? ` · 跳过 ${skipped} 天已有记录` : ''}
            </span>
          </div>
          <button
            type="button"
            className="primary-button save-button"
            onClick={handleSave}
            disabled={!canSave}
          >
            {freeDates.length > 0 ? `补记 ${freeDates.length} 班` : '没有可补记的日期'}
          </button>
        </>
      }
    >
      <div className="form">
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

        <div className="field">
          <span className="field-label">补记范围</span>
          <div className="batch-range">
            <input
              type="date"
              className="batch-date-input"
              value={startDate}
              max={endDate}
              onChange={(event) => {
                if (event.target.value) setStartDate(event.target.value);
              }}
              aria-label="补记开始日期"
            />
            <span className="batch-range-sep">至</span>
            <input
              type="date"
              className="batch-date-input"
              value={endDate}
              min={startDate}
              onChange={(event) => {
                if (event.target.value) setEndDate(event.target.value);
              }}
              aria-label="补记结束日期"
            />
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            重复星期
            <small className="field-label-note">
              {weekdays.length === 0 ? '至少选一天' : `已选 ${weekdays.length} 天`}
            </small>
          </span>
          <div className="batch-weekdays" role="group" aria-label="选择要补记的星期">
            {WEEKDAY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={weekdays.includes(option.value) ? 'is-active' : ''}
                onClick={() => toggleWeekday(option.value)}
                aria-pressed={weekdays.includes(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {autoMultiplier ? (
          <div className="field">
            <span className="field-label">计薪倍数</span>
            <div className="batch-auto-multiplier">
              <span>
                <strong>按每天日期自动</strong>
                <small>
                  {dayRule?.enabled
                    ? `周末 ${formatMultiplier(dayRule.weekendMultiplier)}× · 节假日 ${formatMultiplier(dayRule.holidayMultiplier)}×`
                    : '日期倍率未开启，全部按 1×'}
                </small>
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => setAutoMultiplier(false)}
              >
                改为统一
              </button>
            </div>
          </div>
        ) : (
          <>
            <MultiplierField
              value={manualMultiplier}
              onChange={setManualMultiplier}
              note="所有日期统一"
            />
            <button
              type="button"
              className="text-button"
              onClick={() => setAutoMultiplier(true)}
            >
              恢复按日期自动
            </button>
          </>
        )}

        <div className="batch-summary">
          <div>
            <span>命中</span>
            <strong>
              {freeDates.length}
              <small>天</small>
            </strong>
          </div>
          <div>
            <span>总工时</span>
            <strong>
              {Math.round((totals.minutes / 60) * 10) / 10}
              <small>h</small>
            </strong>
          </div>
          <div>
            <span>预计收入</span>
            <strong>
              <small>¥</small>
              {formatMoney(totals.earnings)}
            </strong>
          </div>
        </div>

        {skipped > 0 ? (
          <p className="batch-note">
            <InfoIcon size={13} />
            {skipped} 天已有记录，会自动跳过；其余 {freeDates.length} 天会生成新记录。
          </p>
        ) : null}

        {rangeDays > MAX_BATCH_DAYS ? (
          <p className="batch-note is-warning">
            <InfoIcon size={13} />
            单次最多补记 {MAX_BATCH_DAYS} 天，当前区间只取前 {MAX_BATCH_DAYS} 天。
          </p>
        ) : null}

        {freeDates.length > 0 ? (
          <p className="batch-note">
            <InfoIcon size={13} />
            {formatDateCN(freeDates[0])} 至 {formatDateCN(freeDates.at(-1) ?? freeDates[0])}
            ，保存后可在提示条里撤销。
          </p>
        ) : null}

        <div className="field">
          <span className="field-label">备注</span>
          <input
            className="text-input"
            value={draft.note}
            onChange={(event) => patch({ note: event.target.value })}
            placeholder="可选，会写入每一条记录"
            maxLength={40}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
