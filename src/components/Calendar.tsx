import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import type { PlannedShift, ShiftTemplate, WorkRecord } from '../types';
import { round2 } from '../num';
import { isPlanMissed } from '../planStats';
import { summarizeByDate, summarizePlansByDate } from '../overview';
import { isISODate } from '../storage';
import { hapticTap } from '../feedback';
import {
  canStartPlan,
  daysInMonth,
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
  planPay,
  recordsInMonth,
  shiftMonth,
  summarizeRecords,
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
import { AnimatedValue } from './AnimatedValue';
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
  activePlanId: string | null;
  reminderEnabled: boolean;
  focusRequest?: { date: string; token: number } | null;
  onModeChange: (mode: CalendarMode) => void;
  onEditRecord: (record: WorkRecord) => void;
  onAddRecord: (date: string) => void;
  onAddPlan: (date: string) => void;
  onOpenBatch: (date: string) => void;
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
  activePlanId: string | null;
  reminderEnabled: boolean;
  onEdit: (plan: PlannedShift) => void;
  onStart: (plan: PlannedShift) => void;
  onRecord: (plan: PlannedShift) => void;
}

function PlanRow({
  plan,
  current,
  timingActive,
  activePlanId,
  reminderEnabled,
  onEdit,
  onStart,
  onRecord,
}: PlanRowProps) {
  const today = toISODate(current);
  const past = isPlanPast(plan, current);
  const startable = !past && canStartPlan(plan, current);
  const minutes = workedMinutes(plan.start, plan.end, plan.breakMinutes);
  const pay = planPay(plan);
  const earnings = pay.total;
  const reminder = reminderEnabled && plan.reminderEnabled !== false && !past;
  const missed = isPlanMissed(plan, current, activePlanId);
  const isActivePlan = activePlanId === plan.id;

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
            {isActivePlan ? (
              <span className="plan-badge is-timing">计时中</span>
            ) : missed ? (
              <span className="plan-badge is-missed">待补记</span>
            ) : past ? (
              <span className="plan-badge">已过</span>
            ) : plan.date === today ? (
              <span className="plan-badge is-today">今天</span>
            ) : null}
            {plan.multiplier !== 1 ? (
              <span className="mini-tag is-accent">×{plan.multiplier}</span>
            ) : null}
            {pay.overtimeMinutes > 0 ? (
              <span className="mini-tag is-overtime">
                加班 {formatHours(pay.overtimeMinutes)}h
              </span>
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
  activePlanId,
  reminderEnabled,
  focusRequest,
  onModeChange,
  onEditRecord,
  onAddRecord,
  onAddPlan,
  onOpenBatch,
  onOpenRotation,
  onEditPlan,
  onStartPlan,
  onRecordPlan,
}: CalendarProps) {
  const { date: current } = useClock();
  const today = toISODate(current);
  const currentYear = Number(today.slice(0, 4));
  const currentMonthIndex = Number(today.slice(5, 7)) - 1;
  // focusRequest 可能来自通知等外部入口，日期不合法时退回今天，避免出现 NaN 年月
  const focusDate = focusRequest && isISODate(focusRequest.date) ? focusRequest.date : null;
  const initialFocus = focusDate ? parseISODate(focusDate) : current;
  const [anchor, setAnchor] = useState({
    year: initialFocus.getFullYear(),
    monthIndex: initialFocus.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState(focusDate ?? today);
  const [monthMotion, setMonthMotion] = useState<'next' | 'prev' | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    horizontal: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const panelFrameRef = useRef<number | null>(null);
  const panelTimerRef = useRef<number | null>(null);

  const isCurrentMonth =
    anchor.year === currentYear && anchor.monthIndex === currentMonthIndex;
  const prefix = monthKey(anchor.year, anchor.monthIndex);

  /**
   * 月历需要的派生数据一次算完：
   * 选日期、滑动手势都会触发重渲染，如果逐格重新计薪，大月视图会明显卡顿。
   */
  const monthView = useMemo(() => {
    const monthRecords = recordsInMonth(records, anchor.year, anchor.monthIndex);
    const monthPlans = plans.filter((plan) => plan.date.startsWith(prefix));

    const recordsByDate = new Map<string, WorkRecord[]>();
    monthRecords.forEach((record) => {
      const list = recordsByDate.get(record.date) ?? [];
      list.push(record);
      recordsByDate.set(record.date, list);
    });
    const plansByDate = new Map<string, PlannedShift[]>();
    monthPlans.forEach((plan) => {
      const list = plansByDate.get(plan.date) ?? [];
      list.push(plan);
      plansByDate.set(plan.date, list);
    });

    const planTotals = summarizePlansByDate(monthPlans);
    let plannedMinutes = 0;
    let plannedEarnings = 0;
    planTotals.forEach((day) => {
      plannedMinutes += day.minutes;
      plannedEarnings += day.earnings;
    });

    return {
      monthPlans,
      recordsByDate,
      plansByDate,
      recordTotals: summarizeByDate(monthRecords),
      recordSummary: summarizeRecords(monthRecords),
      planTotals,
      plannedMinutes,
      plannedEarnings: round2(plannedEarnings),
      plannedDays: planTotals.size,
    };
  }, [records, plans, anchor.year, anchor.monthIndex, prefix]);

  const {
    monthPlans,
    recordsByDate: byDate,
    plansByDate,
    recordTotals,
    recordSummary,
    planTotals,
    plannedMinutes,
    plannedEarnings,
    plannedDays,
  } = monthView;
  const totalMinutes = recordSummary.minutes;
  const totalEarnings = recordSummary.earnings;
  const workedDays = recordSummary.days;

  const dayCount = daysInMonth(anchor.year, anchor.monthIndex);
  const leadingBlanks = (new Date(anchor.year, anchor.monthIndex, 1).getDay() + 6) % 7;
  const cellCount = Math.ceil((leadingBlanks + dayCount) / 7) * 7;
  const selectedRecords = (byDate.get(selectedDate) ?? [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const selectedPlans = (plansByDate.get(selectedDate) ?? [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const selectedTotals = recordTotals.get(selectedDate);
  const selectedMinutes = selectedTotals?.minutes ?? 0;
  const selectedEarnings = selectedTotals?.earnings ?? 0;
  const selectedPlanTotals = planTotals.get(selectedDate);
  const selectedPlannedMinutes = selectedPlanTotals?.minutes ?? 0;
  const selectedPlannedEarnings = selectedPlanTotals?.earnings ?? 0;
  const monthEarnings = mode === 'records' ? totalEarnings : plannedEarnings;
  const monthEarningsKey = `${anchor.year}-${anchor.monthIndex}-${mode}`;

  useEffect(
    () => () => {
      if (panelFrameRef.current !== null) {
        cancelAnimationFrame(panelFrameRef.current);
      }
      if (panelTimerRef.current !== null) {
        window.clearTimeout(panelTimerRef.current);
      }
    },
    [],
  );

  const resetPanelPosition = (animate: boolean) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panelFrameRef.current !== null) {
      cancelAnimationFrame(panelFrameRef.current);
      panelFrameRef.current = null;
    }
    panel.classList.remove('is-swiping');
    if (panelTimerRef.current !== null) {
      window.clearTimeout(panelTimerRef.current);
      panelTimerRef.current = null;
    }
    if (!animate) {
      panel.style.transition = '';
      panel.style.transform = '';
      return;
    }
    panel.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
    panel.style.transform = '';
    panelTimerRef.current = window.setTimeout(() => {
      panelTimerRef.current = null;
      panel.style.transition = '';
    }, 340);
  };

  const goMonth = (delta: number) => {
    const next = shiftMonth(anchor.year, anchor.monthIndex, delta);
    setMonthMotion(delta > 0 ? 'next' : 'prev');
    hapticTap();
    setAnchor(next);
    setSelectedDate(
      defaultDateForMonth(records, plans, next.year, next.monthIndex, current, today),
    );
  };

  const returnToCurrent = () => {
    const targetKey = monthKey(current.getFullYear(), current.getMonth());
    setMonthMotion(
      targetKey > monthKey(anchor.year, anchor.monthIndex) ? 'next' : 'prev',
    );
    hapticTap();
    setAnchor({ year: current.getFullYear(), monthIndex: current.getMonth() });
    setSelectedDate(today);
  };

  const handleTouchStart = (event: ReactTouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, horizontal: false };
  };

  const handleTouchMove = (event: ReactTouchEvent) => {
    const start = touchStartRef.current;
    const panel = panelRef.current;
    if (!start || !panel) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (!start.horizontal) {
      if (Math.abs(deltaX) < 12 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
      start.horizontal = true;
      panel.classList.add('is-swiping');
    }
    if (panelFrameRef.current !== null) cancelAnimationFrame(panelFrameRef.current);
    panelFrameRef.current = requestAnimationFrame(() => {
      panelFrameRef.current = null;
      const offset = Math.max(-22, Math.min(22, deltaX * 0.3));
      panel.style.transform = `translate3d(${offset}px, 0, 0)`;
    });
  };

  const finishSwipe = (deltaX: number, horizontal: boolean) => {
    if (horizontal) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 380);
      if (Math.abs(deltaX) >= 56) {
        goMonth(deltaX < 0 ? 1 : -1);
      }
      resetPanelPosition(true);
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    finishSwipe(touch.clientX - start.x, start.horizontal);
  };

  const handleTouchCancel = () => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    finishSwipe(0, start?.horizontal ?? false);
  };

  // 月历格子只跟「哪个月、这个月有几天」有关：选中日期、滑动动画不该让它重算
  const cells = useMemo(
    () =>
      Array.from({ length: cellCount }, (_, index) => {
        const day = index - leadingBlanks + 1;
        if (day < 1 || day > dayCount) return null;
        const date = `${prefix}-${pad2(day)}`;
        return { date, day };
      }),
    [cellCount, leadingBlanks, dayCount, prefix],
  );

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
          <button
            type="button"
            className="rotation-entry"
            onClick={() => onOpenBatch(selectedDate)}
          >
            <NotebookIcon size={13} />
            批量补记
          </button>
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
        ref={panelRef}
        className="panel calendar-panel"
        aria-label="月度班次日历"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {mode === 'records' ? (
          <div className="calendar-summary">
            <div>
              <span>当月收入</span>
              <strong>
                <small>¥</small>
                <AnimatedValue value={monthEarnings} resetKey={monthEarningsKey} />
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
                <AnimatedValue value={monthEarnings} resetKey={monthEarningsKey} />
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

        <div
          className={`calendar-grid${
            monthMotion ? ` calendar-grid-${monthMotion}` : ''
          }`}
          key={`${anchor.year}-${anchor.monthIndex}`}
        >
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
              ? (recordTotals.get(cell.date)?.earnings ?? 0)
              : (planTotals.get(cell.date)?.earnings ?? 0);
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
        <div className="day-detail-inner" key={`${selectedDate}-${mode}`}>
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
                  activePlanId={activePlanId}
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
        </div>
      </section>
    </div>
  );
}
