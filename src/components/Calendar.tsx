import { useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import type { PlannedShift, ShiftTemplate, WorkRecord } from '../types';
import {
  canStartPlan,
  daysInMonth,
  earningsOf,
  formatDayHeading,
  formatDuration,
  formatHours,
  formatMoney,
  formatTimeRange,
  isPlanPast,
  monthKey,
  monthLabel,
  pad2,
  parseISODate,
  recordEarnings,
  recordMinutes,
  recordsInMonth,
  shiftMonth,
  toISODate,
  workedMinutes,
} from '../utils';
import {
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  NotebookIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
} from './Icons';
import { RangeSwitcher } from './RangeSwitcher';
import { RecordRow } from './RecordRow';
import { useClock } from '../useClock';

export type CalendarMode = 'records' | 'plans';

interface CalendarProps {
  records: WorkRecord[];
  plans: PlannedShift[];
  templates: ShiftTemplate[];
  mode: CalendarMode;
  timingActive: boolean;
  reminderEnabled: boolean;
  focusRequest?: { date: string; token: number } | null;
  onModeChange: (mode: CalendarMode) => void;
  onEditRecord: (record: WorkRecord) => void;
  onAddRecord: (date: string) => void;
  onAddPlan: (date: string) => void;
  onOpenRotation: (date: string) => void;
  onEditPlan: (plan: PlannedShift) => void;
  onStartPlan: (plan: PlannedShift) => void;
  onRecordPlan: (plan: PlannedShift) => void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function defaultDateForMonth(
  records: WorkRecord[],
  plans: PlannedShift[],
  year: number,
  monthIndex: number,
  current: Date,
  today: string,
): string {
  if (year === current.getFullYear() && monthIndex === current.getMonth()) {
    return today;
  }
  const prefix = monthKey(year, monthIndex);
  const dates = [
    ...recordsInMonth(records, year, monthIndex).map((record) => record.date),
    ...plans.filter((plan) => plan.date.startsWith(prefix)).map((plan) => plan.date),
  ].sort();
  const isFutureMonth = prefix > monthKey(current.getFullYear(), current.getMonth());
  return (isFutureMonth ? dates[0] : dates.at(-1)) ?? `${prefix}-01`;
}

interface PlanRowProps {
  plan: PlannedShift;
  current: Date;
  timingActive: boolean;
  reminderEnabled: boolean;
  onEdit: (plan: PlannedShift) => void;
  onStart: (plan: PlannedShift) => void;
  onRecord: (plan: PlannedShift) => void;
}

function PlanRow({
  plan,
  current,
  timingActive,
  reminderEnabled,
  onEdit,
  onStart,
  onRecord,
}: PlanRowProps) {
  const today = toISODate(current);
  const past = isPlanPast(plan, current);
  const startable = !past && canStartPlan(plan, current);
  const minutes = workedMinutes(plan.start, plan.end, plan.breakMinutes);
  const earnings = earningsOf(plan);
  const reminder = reminderEnabled && !past;

  return (
    <div className={`plan-row${past ? ' is-past' : ''}`}>
      <button
        type="button"
        className="plan-row-main"
        onClick={() => onEdit(plan)}
        aria-label={`编辑排班：${plan.date} ${plan.shiftName}${
          reminder ? '，已设置提醒' : ''
        }`}
      >
        <span
          className="plan-row-stripe"
          style={{ backgroundColor: plan.shiftColor }}
          aria-hidden="true"
        />
        <span className="plan-row-info">
          <span className="plan-row-title">
            <span className="plan-row-name">{plan.shiftName}</span>
            {past ? (
              <span className="plan-badge">已过</span>
            ) : plan.date === today ? (
              <span className="plan-badge is-today">今天</span>
            ) : null}
            {plan.multiplier !== 1 ? (
              <span className="mini-tag is-accent">×{plan.multiplier}</span>
            ) : null}
            {reminder ? (
              <BellIcon size={11} className="plan-reminder-icon" />
            ) : null}
          </span>
          <span className="plan-row-sub">
            {formatTimeRange(plan.start, plan.end)} · {formatDuration(minutes)}
            {plan.note ? ` · ${plan.note}` : ''}
          </span>
        </span>
        <span className="plan-row-money">
          <span>¥</span>
          {formatMoney(earnings)}
        </span>
        <ChevronRightIcon size={15} className="plan-row-chevron" />
      </button>
      <div className="plan-row-actions">
        {!past ? (
          <button
            type="button"
            className="plan-row-start"
            onClick={() => onStart(plan)}
            disabled={timingActive || !startable}
          >
            <PlayIcon size={13} />
            {timingActive ? '计时中' : startable ? '开始打卡' : '当天可打卡'}
          </button>
        ) : null}
        <button type="button" className="plan-row-record" onClick={() => onRecord(plan)}>
          <NotebookIcon size={13} />
          记一班
        </button>
      </div>
    </div>
  );
}

export function Calendar({
  records,
  plans,
  templates,
  mode,
  timingActive,
  reminderEnabled,
  focusRequest,
  onModeChange,
  onEditRecord,
  onAddRecord,
  onAddPlan,
  onOpenRotation,
  onEditPlan,
  onStartPlan,
  onRecordPlan,
}: CalendarProps) {
  const { date: current } = useClock();
  const today = toISODate(current);
  const initialFocus = focusRequest ? parseISODate(focusRequest.date) : current;
  const [anchor, setAnchor] = useState({
    year: initialFocus.getFullYear(),
    monthIndex: initialFocus.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState(
    focusRequest?.date ?? today,
  );
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const isCurrentMonth =
    anchor.year === current.getFullYear() && anchor.monthIndex === current.getMonth();
  const prefix = monthKey(anchor.year, anchor.monthIndex);
  const monthRecords = recordsInMonth(records, anchor.year, anchor.monthIndex);
  const monthPlans = plans.filter((plan) => plan.date.startsWith(prefix));
  const totalMinutes = monthRecords.reduce((sum, record) => sum + recordMinutes(record), 0);
  const totalEarnings = monthRecords.reduce((sum, record) => sum + recordEarnings(record), 0);
  const workedDays = new Set(monthRecords.map((record) => record.date)).size;
  const plannedMinutes = monthPlans.reduce(
    (sum, plan) => sum + workedMinutes(plan.start, plan.end, plan.breakMinutes),
    0,
  );
  const plannedEarnings = monthPlans.reduce((sum, plan) => sum + earningsOf(plan), 0);
  const plannedDays = new Set(monthPlans.map((plan) => plan.date)).size;

  const byDate = new Map<string, WorkRecord[]>();
  monthRecords.forEach((record) => {
    const list = byDate.get(record.date) ?? [];
    list.push(record);
    byDate.set(record.date, list);
  });
  const plansByDate = new Map<string, PlannedShift[]>();
  monthPlans.forEach((plan) => {
    const list = plansByDate.get(plan.date) ?? [];
    list.push(plan);
    plansByDate.set(plan.date, list);
  });

  const dayCount = daysInMonth(anchor.year, anchor.monthIndex);
  const leadingBlanks = (new Date(anchor.year, anchor.monthIndex, 1).getDay() + 6) % 7;
  const cellCount = Math.ceil((leadingBlanks + dayCount) / 7) * 7;
  const selectedRecords = (byDate.get(selectedDate) ?? [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const selectedPlans = (plansByDate.get(selectedDate) ?? [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const selectedMinutes = selectedRecords.reduce((sum, record) => sum + recordMinutes(record), 0);
  const selectedEarnings = selectedRecords.reduce((sum, record) => sum + earningsOf(record), 0);
  const selectedPlannedMinutes = selectedPlans.reduce(
    (sum, plan) => sum + workedMinutes(plan.start, plan.end, plan.breakMinutes),
    0,
  );
  const selectedPlannedEarnings = selectedPlans.reduce(
    (sum, plan) => sum + earningsOf(plan),
    0,
  );

  const goMonth = (delta: number) => {
    const next = shiftMonth(anchor.year, anchor.monthIndex, delta);
    setAnchor(next);
    setSelectedDate(
      defaultDateForMonth(records, plans, next.year, next.monthIndex, current, today),
    );
  };

  const returnToCurrent = () => {
    setAnchor({ year: current.getFullYear(), monthIndex: current.getMonth() });
    setSelectedDate(today);
  };

  const handleTouchStart = (event: ReactTouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: ReactTouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    goMonth(deltaX < 0 ? 1 : -1);
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);
  };

  const cells = Array.from({ length: cellCount }, (_, index) => {
    const day = index - leadingBlanks + 1;
    if (day < 1 || day > dayCount) return null;
    const date = `${prefix}-${pad2(day)}`;
    return { date, day };
  });

  const openDate = (date: string) => {
    setSelectedDate(date);
    if (mode === 'records') {
      onAddRecord(date);
    } else {
      onAddPlan(date);
    }
  };

  const detailCountText =
    mode === 'records'
      ? selectedRecords.length > 0
        ? `${selectedRecords.length} 班 · ${formatHours(selectedMinutes)}h`
        : '这一天还没有记录'
      : selectedPlans.length > 0
        ? `${selectedPlans.length} 个排班 · ${formatHours(selectedPlannedMinutes)}h`
        : '这一天还没有排班';

  return (
    <div className="screen calendar-screen">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">SHIFT CALENDAR</p>
          <h1>日历</h1>
        </div>
        <p className="page-sub">
          {mode === 'records' ? '点日期，直接记一班。' : '提前排班，到点再打卡。'}
        </p>
      </header>

      <div className="calendar-mode-row">
        <div className="calendar-mode-switch" role="group" aria-label="日历模式">
          <button
            type="button"
            className={mode === 'records' ? 'is-active' : ''}
            onClick={() => onModeChange('records')}
            aria-pressed={mode === 'records'}
          >
            <NotebookIcon size={13} />
            记录
          </button>
          <button
            type="button"
            className={mode === 'plans' ? 'is-active' : ''}
            onClick={() => onModeChange('plans')}
            aria-pressed={mode === 'plans'}
          >
            <CalendarIcon size={13} />
            排班
          </button>
        </div>
        {mode === 'plans' ? (
          <button
            type="button"
            className="rotation-entry"
            onClick={() => onOpenRotation(selectedDate)}
          >
            <RepeatIcon size={13} />
            轮班表
          </button>
        ) : (
          <span className="calendar-mode-hint">查看或补记班次</span>
        )}
      </div>

      <RangeSwitcher
        label={monthLabel(anchor.year, anchor.monthIndex)}
        isCurrent={isCurrentMonth}
        currentLabel="本月"
        resetLabel="回到本月"
        previousLabel="上个月"
        nextLabel="下个月"
        onPrevious={() => goMonth(-1)}
        onNext={() => goMonth(1)}
        onReset={returnToCurrent}
        allowFuture
      />

      <section
        className="panel calendar-panel"
        aria-label="月度班次日历"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {mode === 'records' ? (
          <div className="calendar-summary">
            <div>
              <span>当月收入</span>
              <strong>
                <small>¥</small>
                {formatMoney(totalEarnings)}
              </strong>
            </div>
            <div className="calendar-summary-meta">
              <span>{workedDays} 天</span>
              <span className="dot-divider" aria-hidden="true" />
              <span>{formatHours(totalMinutes)}h</span>
            </div>
          </div>
        ) : (
          <div className="calendar-summary">
            <div>
              <span>当月排班 · 预计</span>
              <strong>
                <small>¥</small>
                {formatMoney(plannedEarnings)}
              </strong>
            </div>
            <div className="calendar-summary-meta">
              <span>{plannedDays} 天</span>
              <span className="dot-divider" aria-hidden="true" />
              <span>{monthPlans.length} 班</span>
              <span className="dot-divider" aria-hidden="true" />
              <span>{formatHours(plannedMinutes)}h</span>
            </div>
          </div>
        )}

        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((cell, index) => {
            if (!cell) {
              return (
                <span
                  className="calendar-day is-blank"
                  aria-hidden="true"
                  key={`blank-${index}`}
                />
              );
            }
            const cellRecords = byDate.get(cell.date) ?? [];
            const cellPlans = plansByDate.get(cell.date) ?? [];
            const showsRecords = mode === 'records';
            const items = showsRecords ? cellRecords : cellPlans;
            const isSelected = cell.date === selectedDate;
            const isToday = cell.date === today;
            const weekday = new Date(anchor.year, anchor.monthIndex, cell.day).getDay();
            const isWeekend = weekday === 0 || weekday === 6;
            const dotColors = Array.from(
              new Set(items.map((item) => item.shiftColor)),
            ).slice(0, 3);
            const dayTotal = showsRecords
              ? cellRecords.reduce((sum, record) => sum + recordEarnings(record), 0)
              : cellPlans.reduce((sum, plan) => sum + earningsOf(plan), 0);
            const label = showsRecords
              ? cellRecords.length > 0
                ? `${cellRecords.length} 班，收入 ${formatMoney(dayTotal)} 元`
                : '没有记录'
              : cellPlans.length > 0
                ? `${cellPlans.length} 个排班，预计 ${formatMoney(dayTotal)} 元`
                : '没有排班';
            return (
              <button
                type="button"
                key={cell.date}
                className={[
                  'calendar-day',
                  items.length > 0
                    ? showsRecords
                      ? 'has-shift'
                      : 'has-plan'
                    : '',
                  isSelected ? 'is-selected' : '',
                  isToday ? 'is-today' : '',
                  isWeekend ? 'is-weekend' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  if (suppressClickRef.current) return;
                  openDate(cell.date);
                }}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${anchor.monthIndex + 1}月${cell.day}日，${label}，${
                  showsRecords ? '点击记一班' : '点击排班'
                }`}
              >
                <span className="calendar-day-num">{cell.day}</span>
                <span className="calendar-dots" aria-hidden="true">
                  {dotColors.map((color) =>
                    showsRecords ? (
                      <i key={color} style={{ backgroundColor: color }} />
                    ) : (
                      <i key={color} className="is-plan-dot" style={{ borderColor: color }} />
                    ),
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {templates.length > 0 ? (
          <div className="calendar-legend">
            {templates.slice(0, 5).map((template) => (
              <span key={template.id}>
                <i
                  className={mode === 'plans' ? 'is-plan-dot' : ''}
                  style={
                    mode === 'plans'
                      ? { borderColor: template.color }
                      : { backgroundColor: template.color }
                  }
                  aria-hidden="true"
                />
                {template.name}
              </span>
            ))}
            {templates.length > 5 ? <span>+{templates.length - 5}</span> : null}
          </div>
        ) : null}
      </section>

      <section className="panel day-detail-panel" aria-label="选中日期的详情">
        <div className="day-detail-head">
          <div>
            <h2>{formatDayHeading(selectedDate)}</h2>
            <p>{detailCountText}</p>
          </div>
          {mode === 'records' && selectedRecords.length > 0 ? (
            <span className="day-detail-total">¥{formatMoney(selectedEarnings)}</span>
          ) : null}
          {mode === 'plans' && selectedPlans.length > 0 ? (
            <span className="day-detail-total">¥{formatMoney(selectedPlannedEarnings)}</span>
          ) : null}
        </div>

        {mode === 'records' ? (
          selectedRecords.length > 0 ? (
            <div className="day-list day-detail-list">
              {selectedRecords.map((record) => (
                <RecordRow key={record.id} record={record} onClick={onEditRecord} />
              ))}
            </div>
          ) : (
            <p className="day-detail-hint">休息日也很重要，或者补记这一天的班次。</p>
          )
        ) : selectedPlans.length > 0 ? (
          <div className="plan-list">
            {selectedPlans.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                current={current}
                timingActive={timingActive}
                reminderEnabled={reminderEnabled}
                onEdit={onEditPlan}
                onStart={onStartPlan}
                onRecord={onRecordPlan}
              />
            ))}
          </div>
        ) : (
          <p className="day-detail-hint">这一天还没有排班。提前排好，到点直接打卡。</p>
        )}

        <button
          type="button"
          className="add-day-button"
          onClick={() => (mode === 'records' ? onAddRecord(selectedDate) : onAddPlan(selectedDate))}
        >
          <PlusIcon size={16} />
          {mode === 'records'
            ? selectedRecords.length > 0
              ? '再记一班'
              : '记这一天'
            : selectedPlans.length > 0
              ? '再排一班'
              : '排这一天'}
        </button>
      </section>
    </div>
  );
}
