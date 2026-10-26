import { useState, type CSSProperties } from 'react';
import { findMissedPlans } from '../planStats';
import type { ActiveShift, PlannedShift, ShiftTemplate, WorkRecord } from '../types';
import {
  addDaysISO,
  earningsOf,
  formatDateCN,
  formatDayHeading,
  formatHeaderDate,
  formatHours,
  formatMoney,
  getWeekRange,
  groupByDate,
  isPlanPast,
  recordEarnings,
  recordMinutes,
  recordsInMonth,
  recordsInRange,
  sortPlans,
  sortRecords,
  summarizeRecords,
  toISODate,
} from '../utils';
import {
  ArrowUpRightIcon,
  BellIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  LogoMark,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
} from './Icons';
import { RecordRow } from './RecordRow';
import { ActiveTimingCard } from './ActiveTimingCard';
import { NextPlanCard } from './NextPlanCard';
import { useClock } from '../useClock';

interface HomeProps {
  records: WorkRecord[];
  templates: ShiftTemplate[];
  plans: PlannedShift[];
  monthlyGoal: number;
  activeShift: ActiveShift | null;
  onAdd: (template: ShiftTemplate | null) => void;
  onEditRecord: (record: WorkRecord) => void;
  onGoStats: () => void;
  onGoWeekStats: () => void;
  onStartTiming: () => void;
  onStartPlan: (plan: PlannedShift) => void;
  onRecordPlan: (plan: PlannedShift) => void;
  onEditPlan: (plan: PlannedShift) => void;
  onOpenMissed: () => void;
  onClockOut: () => void;
  onPauseTiming: () => void;
  onResumeTiming: () => void;
  onAbandonTiming: () => void;
}

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function isNightShift(template: ShiftTemplate): boolean {
  return template.name.includes('夜') || template.end < template.start;
}

export function Home({
  records,
  templates,
  plans,
  monthlyGoal,
  activeShift,
  onAdd,
  onEditRecord,
  onGoStats,
  onGoWeekStats,
  onStartTiming,
  onStartPlan,
  onRecordPlan,
  onEditPlan,
  onOpenMissed,
  onClockOut,
  onPauseTiming,
  onResumeTiming,
  onAbandonTiming,
}: HomeProps) {
  const { date: now } = useClock();
  const [query, setQuery] = useState('');
  const monthRecords = recordsInMonth(records, now.getFullYear(), now.getMonth());
  const totalMinutes = monthRecords.reduce((sum, record) => sum + recordMinutes(record), 0);
  const totalEarnings = monthRecords.reduce((sum, record) => sum + recordEarnings(record), 0);
  const workedDays = new Set(monthRecords.map((record) => record.date)).size;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecords = normalizedQuery
    ? records.filter((record) =>
        [record.shiftName, record.note, record.date, formatDateCN(record.date)].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : records;
  const groups = groupByDate(sortRecords(filteredRecords));
  const showSearch = records.length > 5 || normalizedQuery.length > 0;
  const goalPercent = monthlyGoal > 0 ? Math.round((totalEarnings / monthlyGoal) * 100) : 0;
  const goalDone = monthlyGoal > 0 && totalEarnings >= monthlyGoal;

  const today = toISODate(now);
  const missedPlans = findMissedPlans(
    plans,
    now,
    activeShift?.sourcePlanId ?? null,
  );
  const upcomingPlans = sortPlans(plans.filter((plan) => !isPlanPast(plan, now)));
  const nextPlan = upcomingPlans[0] ?? null;
  const upcomingCount = upcomingPlans.filter(
    (plan) => plan.date <= addDaysISO(today, 7),
  ).length;
  const weekRange = getWeekRange(today);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDaysISO(weekRange.start, index),
  );
  const todayWeekIndex = weekDates.indexOf(today);
  const weekRecords = recordsInRange(records, weekRange.start, weekRange.end);
  const previousWeekRange = getWeekRange(addDaysISO(weekRange.start, -7));
  const previousWeekCutoff =
    todayWeekIndex >= 0
      ? addDaysISO(previousWeekRange.start, todayWeekIndex)
      : previousWeekRange.end;
  const previousWeekRecords = recordsInRange(
    records,
    previousWeekRange.start,
    previousWeekCutoff,
  );
  const weekSummary = summarizeRecords(weekRecords);
  const weekMinutes = weekSummary.minutes;
  const weekEarnings = weekSummary.earnings;
  const weekWorkedDays = weekSummary.days;
  const previousWeekEarnings = summarizeRecords(previousWeekRecords).earnings;
  const weekSeries = weekDates.map((date) => ({
    date,
    earnings: records
      .filter((record) => record.date === date)
      .reduce((sum, record) => sum + recordEarnings(record), 0),
  }));
  const maxWeekDayEarnings = Math.max(...weekSeries.map((day) => day.earnings), 1);
  const hasWeekData = weekRecords.length > 0 || previousWeekRecords.length > 0;
  const weekDifference = weekEarnings - previousWeekEarnings;
  const weekTrendText =
    weekRecords.length === 0
      ? '本周暂无记录'
      : previousWeekEarnings > 0
        ? weekDifference === 0
          ? '较上周持平'
          : `较上周 ${weekDifference > 0 ? '+' : '-'}¥${formatMoney(Math.abs(weekDifference))}`
        : '上周无记录';
  const weekTrendClass =
    weekRecords.length === 0
      ? ''
      : weekDifference > 0
        ? ' is-up'
        : weekDifference < 0
          ? ' is-down'
          : '';

  return (
    <div className="screen home-screen">
      <header className="home-header">
        <div className="brand">
          <LogoMark size={42} />
          <div>
            <p className="brand-eyebrow">SHIFT LEDGER</p>
            <h1>工时账本</h1>
          </div>
        </div>
        <div className="home-date">{formatHeaderDate(now)}</div>
      </header>

      {activeShift ? (
        <ActiveTimingCard
          shift={activeShift}
          onPause={onPauseTiming}
          onResume={onResumeTiming}
          onStop={onClockOut}
          onAbandon={onAbandonTiming}
        />
      ) : nextPlan ? (
        <NextPlanCard
          plan={nextPlan}
          upcomingCount={upcomingCount}
          now={now}
          onStart={onStartPlan}
          onRecord={onRecordPlan}
          onEdit={onEditPlan}
        />
      ) : null}

      {missedPlans.length > 0 ? (
        <button
          type="button"
          className="missed-card"
          onClick={onOpenMissed}
          aria-label={`有 ${missedPlans.length} 个排班待处理，点击处理`}
        >
          <span className="missed-card-icon">
            <BellIcon size={18} />
          </span>
          <span className="missed-card-main">
            <strong>{missedPlans.length} 个排班待处理</strong>
            <span>
              最早：{formatDateCN(missedPlans[0].date)} · {missedPlans[0].shiftName}
            </span>
          </span>
          <ChevronRightIcon size={16} className="missed-card-chevron" />
        </button>
      ) : null}

      <section className="hero-card" aria-label="本月收入概览">
        <svg className="hero-orbit" viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r="92" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeDasharray="1 8" strokeLinecap="round" />
          <circle cx="110" cy="110" r="68" fill="none" stroke="currentColor" strokeOpacity="0.1" />
          <path d="M110 110V60M110 110l34 24" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />
          <circle cx="110" cy="110" r="4" fill="#D45A3C" />
        </svg>
        <div className="hero-top">
          <span className="hero-label">
            <span className="hero-pulse" aria-hidden="true" />
            本月收入 · {now.getMonth() + 1}月
          </span>
          <span className="hero-greeting">{greeting(now)}</span>
        </div>
        <p className="hero-amount">
          <span className="hero-currency">¥</span>
          {formatMoney(totalEarnings)}
        </p>
        <div className="hero-stats">
          <div>
            <span>总工时</span>
            <strong>
              {formatHours(totalMinutes)}
              <small>h</small>
            </strong>
          </div>
          <div>
            <span>出勤</span>
            <strong>
              {workedDays}
              <small>天</small>
            </strong>
          </div>
          <div>
            <span>班次</span>
            <strong>
              {monthRecords.length}
              <small>班</small>
            </strong>
          </div>
        </div>
        {monthlyGoal > 0 ? (
          <div className={`hero-goal${goalDone ? ' is-done' : ''}`}>
            <div className="hero-goal-head">
              <span>月收入目标 ¥{formatMoney(monthlyGoal)}</span>
              <strong>{goalPercent}%</strong>
            </div>
            <div className="hero-goal-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, goalPercent)}%` }} />
            </div>
            <p>
              {goalDone
                ? `已超出目标 ¥${formatMoney(totalEarnings - monthlyGoal)}`
                : `还差 ¥${formatMoney(monthlyGoal - totalEarnings)} 达成`}
            </p>
          </div>
        ) : null}
      </section>

      {hasWeekData ? (
        <button
          type="button"
          className="week-glance"
          onClick={onGoWeekStats}
          aria-label={`查看本周统计，本周收入 ${formatMoney(weekEarnings)} 元，工时 ${formatHours(weekMinutes)} 小时，出勤 ${weekWorkedDays} 天`}
        >
          <span className="week-glance-main">
            <span className="week-glance-head">
              <span className="week-glance-title">本周</span>
              <span className={`week-trend${weekTrendClass}`}>{weekTrendText}</span>
              <ArrowUpRightIcon size={12} className="week-open-icon" />
            </span>
            <span className="week-glance-amount">
              <small>¥</small>
              {formatMoney(weekEarnings)}
            </span>
            <span className="week-glance-meta">
              {formatHours(weekMinutes)}h
              <span className="dot-divider" aria-hidden="true" />
              {weekWorkedDays} 天
            </span>
          </span>
          <span className="week-spark" aria-hidden="true">
            {weekSeries.map((day, index) => (
              <span
                key={day.date}
                className={[
                  index === todayWeekIndex ? 'is-today' : '',
                  day.earnings === 0 ? 'is-empty' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <i
                  style={{
                    height: `${day.earnings > 0 ? Math.max(8, (day.earnings / maxWeekDayEarnings) * 100) : 3}%`,
                  }}
                />
              </span>
            ))}
          </span>
        </button>
      ) : null}

      <section className="section">
        <div className="section-head">
          <div>
            <h2>记一班</h2>
            <p>选个班次，自动带出时间和时薪</p>
          </div>
          {!activeShift && templates.length > 0 ? (
            <button type="button" className="text-button clock-in-entry" onClick={onStartTiming}>
              <PlayIcon size={14} />
              打卡计时
            </button>
          ) : null}
        </div>
        <div className="quick-scroll">
          {templates.map((template) => {
            const night = isNightShift(template);
            const Icon = night ? MoonIcon : SunIcon;
            return (
              <button
                key={template.id}
                type="button"
                className="quick-card"
                style={{ '--shift-color': template.color } as CSSProperties}
                onClick={() => onAdd(template)}
              >
                <span className="quick-top">
                  <span className="quick-icon">
                    <Icon size={18} />
                  </span>
                  <span className="quick-rate">
                    ¥{template.rate}
                    <small>/时</small>
                  </span>
                </span>
                <span className="quick-name">{template.name}</span>
                <span className="quick-time">
                  {template.start} – {template.end}
                </span>
              </button>
            );
          })}
          <button type="button" className="quick-card is-custom" onClick={() => onAdd(null)}>
            <span className="quick-add">
              <PlusIcon size={18} />
            </span>
            <span className="quick-name">自定义</span>
            <span className="quick-time">手动填写</span>
          </button>
        </div>
      </section>

      <section className="section records-section">
        <div className="section-head">
          <div>
            <h2>班次记录</h2>
            <p>
              {normalizedQuery
                ? `找到 ${filteredRecords.length} 条记录`
                : records.length > 0
                  ? `一共 ${records.length} 条记录`
                  : '每一班，都值得记下来'}
            </p>
          </div>
          {records.length > 0 ? (
            <button type="button" className="text-button" onClick={onGoStats}>
              月度统计
              <ArrowUpRightIcon size={15} />
            </button>
          ) : null}
        </div>

        {showSearch ? (
          <div className="search-bar">
            <SearchIcon size={16} className="search-icon" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索班次、备注或日期"
              aria-label="搜索记录"
            />
            {query ? (
              <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
                <CloseIcon size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        {records.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true">
              <svg viewBox="0 0 160 130">
                <circle cx="62" cy="58" r="42" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 6" opacity="0.45" />
                <circle className="empty-clock-face" cx="62" cy="58" r="31" fill="#FBF7EE" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
                <path d="M62 39v19l12 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="62" cy="58" r="3" fill="#D45A3C" />
                <rect x="111" y="37" width="34" height="7" rx="3.5" fill="#D8A33B" opacity="0.9" />
                <rect x="111" y="53" width="26" height="7" rx="3.5" fill="#D8A33B" opacity="0.5" />
                <rect x="111" y="69" width="34" height="7" rx="3.5" fill="#D8A33B" opacity="0.28" />
                <path d="M28 108c18-8 33-8 52 0s34 8 52 0" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25" strokeLinecap="round" />
              </svg>
            </div>
            <h3>从第一班开始</h3>
            <p>记下工作时间和时薪，月底的收入自动算好。</p>
            <button type="button" className="primary-button" onClick={() => onAdd(templates[0] ?? null)}>
              <PlusIcon size={18} />
              记下第一班
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="search-empty">
            <SearchIcon size={22} />
            <p>没有找到相关记录</p>
            <button type="button" className="ghost-button" onClick={() => setQuery('')}>
              清空搜索
            </button>
          </div>
        ) : (
          <div className="day-groups">
            {groups.map((group) => {
              const dayMinutes = group.items.reduce((sum, item) => sum + recordMinutes(item), 0);
              const dayEarnings = group.items.reduce((sum, item) => sum + earningsOf(item), 0);
              return (
                <div className="day-group" key={group.date}>
                  <div className="day-header">
                    <div>
                      <span className="day-title">{formatDayHeading(group.date)}</span>
                      <span className="day-meta">
                        {group.items.length} 班 · {formatHours(dayMinutes)}h
                      </span>
                    </div>
                    <span className="day-earnings">+ ¥{formatMoney(dayEarnings)}</span>
                  </div>
                  <div className="day-list">
                    {group.items.map((record) => (
                      <RecordRow key={record.id} record={record} onClick={onEditRecord} />
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="records-footnote">
              <ClockIcon size={13} />
              收入按实际工时（扣除休息）计算
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
