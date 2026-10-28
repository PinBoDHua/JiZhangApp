/**
 * 日期与时间（纯函数，不依赖任何业务模块）。
 *
 * 从 utils.ts 拆出的第一部分。这里只处理「ISO 日期字符串 ↔ Date ↔ 分钟数」，
 * 不涉及金额、记录或排班——排班的「是否已过」「能否打卡」属于业务判断，放在 utils/index。
 */

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

/**
 * 严格解析：非法或溢出日期（如 2026-02-30）返回 null。
 * 展示层用它兜底，避免手改坏的日期在界面上变成「NaN月NaN日」或被静默进位成另一天。
 */
function parseValidISODate(iso: string): Date | null {
  if (typeof iso !== 'string') return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, delta: number): string {
  const date = parseValidISODate(iso);
  // 日期不合法时原样返回，避免把 "NaN-NaN-NaN" 写进记录或排班
  if (!date) return iso;
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

export function getWeekRange(iso: string): { start: string; end: string } {
  const date = parseValidISODate(iso) ?? new Date();
  const offset = (date.getDay() + 6) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

export function repeatDatesISO(dateISO: string, weeks: number): string[] {
  const count = Math.max(1, Math.min(52, Math.floor(weeks)));
  return Array.from({ length: count }, (_, index) => addDaysISO(dateISO, index * 7));
}

export function formatDateCN(iso: string): string {
  const date = parseValidISODate(iso);
  if (!date) return iso;
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[date.getDay()]}`;
}

export function formatDateFullCN(iso: string): string {
  const date = parseValidISODate(iso);
  if (!date) return iso;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatHeaderDate(date = new Date()): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

export function formatDayHeading(iso: string): string {
  const date = parseValidISODate(iso);
  if (!date) return iso;
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

/** 08:00 – 17:00 / 22:00 – 06:00 次日 */
export function formatTimeRange(start: string, end: string): string {
  return `${start} – ${end}${isOvernight(start, end) ? ' 次日' : ''}`;
}

export function formatDateRangeCN(startISO: string, endISO: string): string {  const start = parseValidISODate(startISO);
  const end = parseValidISODate(endISO);
  if (!start || !end) return `${startISO} – ${endISO}`;
  const startLabel =
    start.getFullYear() === end.getFullYear()
      ? `${start.getMonth() + 1}月${start.getDate()}日`
      : `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日`;
  return `${startLabel} – ${end.getMonth() + 1}月${end.getDate()}日`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${pad2(monthIndex + 1)}`;
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
