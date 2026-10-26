import type {
  ActiveShift,
  OvertimeRule,
  PlannedShift,
  SettlementAdjustment,
  SettlementStatus,
  WorkRecord,
} from './types';
import { computePay, type PayBreakdown } from './pay';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatTimeHM(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, delta: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

export function getWeekRange(iso: string): { start: string; end: string } {
  const date = parseISODate(iso);
  const offset = (date.getDay() + 6) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

export function repeatDatesISO(dateISO: string, weeks: number): string[] {
  const count = Math.max(1, Math.min(52, Math.floor(weeks)));
  return Array.from({ length: count }, (_, index) => addDaysISO(dateISO, index * 7));
}

/** Drops dates that already hold a plan so weekly repeats never stack duplicates. */
export function freePlanDates(dates: string[], plans: { date: string }[]): string[] {
  const occupied = new Set(plans.map((plan) => plan.date));
  return dates.filter((date) => !occupied.has(date));
}

export function isPlanPast(plan: PlannedShift, now: Date): boolean {
  const endDate = isOvernight(plan.start, plan.end) ? addDaysISO(plan.date, 1) : plan.date;
  const today = toISODate(now);
  if (endDate < today) return true;
  if (endDate > today) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current > toMinutes(plan.end);
}

export function canStartPlan(plan: PlannedShift, now: Date): boolean {
  if (isPlanPast(plan, now)) return false;
  const today = toISODate(now);
  if (plan.date === today) return true;
  return isOvernight(plan.start, plan.end) && addDaysISO(plan.date, 1) === today;
}

export function sortPlans(plans: PlannedShift[]): PlannedShift[] {
  return [...plans].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
}

export function findLatestRecord(records: WorkRecord[]): WorkRecord | null {
  const today = todayISO();
  const candidates = records.filter((record) => record.date <= today);
  return candidates.reduce<WorkRecord | null>((latest, record) => {
    if (!latest) return record;
    if (record.date !== latest.date) return record.date > latest.date ? record : latest;
    if (record.start !== latest.start) return record.start > latest.start ? record : latest;
    return record.updatedAt > latest.updatedAt ? record : latest;
  }, null);
}

export function formatDateCN(iso: string): string {
  const date = parseISODate(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[date.getDay()]}`;
}

export function formatDateFullCN(iso: string): string {
  const date = parseISODate(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatHeaderDate(date = new Date()): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

export function relativeDateLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return '今天';
  if (iso === addDaysISO(today, -1)) return '昨天';
  return formatDateCN(iso);
}

export function formatDayHeading(iso: string): string {
  const date = parseISODate(iso);
  const weekday = WEEKDAYS[date.getDay()];
  const today = todayISO();
  if (iso === today) return `今天 · ${weekday}`;
  if (iso === addDaysISO(today, -1)) return `昨天 · ${weekday}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekday}`;
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

export function rawMinutes(start: string, end: string): number {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  if (startMinutes === endMinutes) return 0;
  return endMinutes > startMinutes ? endMinutes - startMinutes : endMinutes - startMinutes + 1440;
}

export function isOvernight(start: string, end: string): boolean {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  return Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes < startMinutes;
}

export function workedMinutes(
  start: string,
  end: string,
  breakMinutes: number,
): number {
  const total = rawMinutes(start, end);
  const rest = Number.isFinite(breakMinutes) ? Math.max(0, breakMinutes) : 0;
  return Math.max(0, total - rest);
}

export interface ShiftPayInput {
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
  multiplier: number;
  overtime?: OvertimeRule | null;
}

/**
 * 时间 + 时薪 + 规则 → 完整计薪明细。所有页面都从这里取数，
 * 避免记录、排班、工资条各自重复一套算法。
 */
export function shiftPay(input: ShiftPayInput): PayBreakdown {
  return computePay({
    minutes: workedMinutes(input.start, input.end, input.breakMinutes),
    rate: input.rate,
    multiplier: input.multiplier,
    overtime: input.overtime,
  });
}

export function earningsOf(input: ShiftPayInput): number {
  return shiftPay(input).total;
}

export function recordPay(record: WorkRecord): PayBreakdown {
  return shiftPay(record);
}

export function planPay(plan: PlannedShift): PayBreakdown {
  return shiftPay(plan);
}

export function recordEarnings(record: WorkRecord): number {
  return recordPay(record).total;
}

export function recordMinutes(record: WorkRecord): number {
  return workedMinutes(record.start, record.end, record.breakMinutes);
}

export function activePauseMs(shift: ActiveShift, nowMs: number): number {
  const pendingPause = shift.pausedAt ? Math.max(0, nowMs - shift.pausedAt) : 0;
  return Math.max(0, shift.pausedMs + pendingPause);
}

export function activeWorkedMs(shift: ActiveShift, nowMs: number): number {
  return Math.max(0, nowMs - shift.startedAt - activePauseMs(shift, nowMs));
}

export function activeWorkedMinutes(shift: ActiveShift, nowMs: number): number {
  return Math.floor(activeWorkedMs(shift, nowMs) / 60_000);
}

const integerMoneyFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const decimalMoneyFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 100) / 100;
  if (rounded === 0) return integerMoneyFormat.format(0);
  return (Number.isInteger(rounded) ? integerMoneyFormat : decimalMoneyFormat).format(rounded);
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

export function formatElapsed(minutes: number): string {
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  return formatDuration(minutes);
}

export function formatHours(minutes: number): string {
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${start} – ${end}${isOvernight(start, end) ? ' 次日' : ''}`;
}

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function recordsInMonth(
  records: WorkRecord[],
  year: number,
  monthIndex: number,
): WorkRecord[] {
  const prefix = monthKey(year, monthIndex);
  return records.filter((record) => record.date.startsWith(prefix));
}

export function recordsInRange(
  records: WorkRecord[],
  start: string,
  end: string,
): WorkRecord[] {
  return records.filter((record) => record.date >= start && record.date <= end);
}

export interface RecordsSummary {
  minutes: number;
  earnings: number;
  days: number;
  shifts: number;
  averageRate: number;
  regularMinutes: number;
  overtimeMinutes: number;
  overtimeEarnings: number;
}

export function summarizeRecords(records: WorkRecord[]): RecordsSummary {
  let minutes = 0;
  let earnings = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let overtimeEarnings = 0;
  records.forEach((record) => {
    const pay = recordPay(record);
    minutes += pay.minutes;
    earnings += pay.total;
    regularMinutes += pay.regularMinutes;
    overtimeMinutes += pay.overtimeMinutes;
    overtimeEarnings += pay.overtimePay;
  });
  return {
    minutes,
    earnings: roundMoney(earnings),
    days: new Set(records.map((record) => record.date)).size,
    shifts: records.length,
    averageRate: minutes > 0 ? earnings / (minutes / 60) : 0,
    regularMinutes,
    overtimeMinutes,
    overtimeEarnings: roundMoney(overtimeEarnings),
  };
}

export function formatDateRangeCN(startISO: string, endISO: string): string {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  const startLabel =
    start.getFullYear() === end.getFullYear()
      ? `${start.getMonth() + 1}月${start.getDate()}日`
      : `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日`;
  return `${startLabel} – ${end.getMonth() + 1}月${end.getDate()}日`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function monthLabel(year: number, monthIndex: number): string {
  return `${year}年${monthIndex + 1}月`;
}

export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const date = new Date(year, monthIndex + delta, 1);
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

export function groupByDate(records: WorkRecord[]): { date: string; items: WorkRecord[] }[] {
  const groups = new Map<string, WorkRecord[]>();
  records.forEach((record) => {
    const items = groups.get(record.date) ?? [];
    items.push(record);
    groups.set(record.date, items);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      items: [...items].sort((a, b) => a.start.localeCompare(b.start)),
    }));
}

export function sortRecords(records: WorkRecord[]): WorkRecord[] {
  return [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start),
  );
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(records: WorkRecord[]): string {
  const header = [
    '日期',
    '班次',
    '开始',
    '结束',
    '休息(分钟)',
    '工时(小时)',
    '时薪',
    '倍数',
    '正常工时(小时)',
    '加班工时(小时)',
    '加班倍数',
    '收入',
    '备注',
  ];
  const rows = sortRecords(records)
    .reverse()
    .map((record) => {
      const pay = recordPay(record);
      return [
        record.date,
        record.shiftName,
        record.start,
        record.end,
        String(record.breakMinutes),
        (pay.minutes / 60).toFixed(2),
        String(record.rate),
        String(record.multiplier),
        (pay.regularMinutes / 60).toFixed(2),
        (pay.overtimeMinutes / 60).toFixed(2),
        pay.overtime && pay.overtimeMinutes > 0 ? String(pay.overtime.multiplier) : '',
        pay.total.toFixed(2),
        record.note,
      ];
    });
  const escape = (value: string) => {
    const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${guarded.replace(/"/g, '""')}"`;
  };
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}

export interface SettlementTotals {
  bonus: number;
  deduction: number;
  advance: number;
  adjustmentTotal: number;
  netDue: number;
}

export function settlementTotals(
  baseEarnings: number,
  adjustments: SettlementAdjustment[],
): SettlementTotals {
  const bonus = roundMoney(
    adjustments
      .filter((item) => item.kind === 'bonus')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const deduction = roundMoney(
    adjustments
      .filter((item) => item.kind === 'deduction')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const advance = roundMoney(
    adjustments
      .filter((item) => item.kind === 'advance')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  return {
    bonus,
    deduction,
    advance,
    adjustmentTotal: roundMoney(bonus - deduction - advance),
    netDue: roundMoney(baseEarnings + bonus - deduction - advance),
  };
}

interface PayslipParams {
  monthLabel: string;
  minutes: number;
  days: number;
  baseEarnings: number;
  adjustments: SettlementAdjustment[];
  totals: SettlementTotals;
  status: SettlementStatus;
  paidAt: string | null;
  paidAmount: number | null;
  note: string;
  /** 2.0 起工资条展示加班明细 */
  overtimeMinutes?: number;
  overtimeEarnings?: number;
}

export function buildPayslipText({
  monthLabel,
  minutes,
  days,
  baseEarnings,
  adjustments,
  totals,
  status,
  paidAt,
  paidAmount,
  note,
  overtimeMinutes = 0,
  overtimeEarnings = 0,
}: PayslipParams): string {
  const lines = [
    `工时账本 · ${monthLabel} 工资条`,
    `出勤 ${days} 天 · ${formatDuration(minutes)}`,
    '',
    `工时收入：¥${formatMoney(baseEarnings)}`,
  ];
  if (overtimeMinutes > 0) {
    lines.push(
      `其中加班：${formatDuration(overtimeMinutes)} · ¥${formatMoney(overtimeEarnings)}`,
    );
  }
  const labels: Record<SettlementAdjustment['kind'], string> = {
    bonus: '奖金',
    deduction: '扣款',
    advance: '预支',
  };
  adjustments
    .filter((item) => item.amount > 0)
    .forEach((item) => {
      const sign = item.kind === 'bonus' ? '+' : '-';
      lines.push(`${item.label.trim() || labels[item.kind]}：${sign}¥${formatMoney(item.amount)}`);
    });
  lines.push(`应发：¥${formatMoney(totals.netDue)}`);
  if (status === 'paid') {
    lines.push(`状态：已到账${paidAt ? `（${formatDateFullCN(paidAt)}）` : ''}`);
    if (paidAmount !== null) {
      lines.push(`实发：¥${formatMoney(paidAmount)}`);
      const difference = roundMoney(paidAmount - totals.netDue);
      if (difference !== 0) {
        lines.push(
          `差额：${difference > 0 ? '+' : '-'}¥${formatMoney(Math.abs(difference))}`,
        );
      }
    }
  } else {
    lines.push('状态：待到账');
  }
  if (note.trim()) lines.push(`备注：${note.trim()}`);
  lines.push('', '由工时账本生成');
  return lines.join('\n');
}
