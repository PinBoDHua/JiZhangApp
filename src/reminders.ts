import type { PlannedShift } from './types';
import {
  addDaysISO,
  earningsOf,
  formatMoney,
  formatTimeRange,
  parseISODate,
  toISODate,
} from './utils';

export const REMINDER_LEAD_OPTIONS = [
  { minutes: 30, label: '30 分钟' },
  { minutes: 60, label: '1 小时' },
  { minutes: 120, label: '2 小时' },
  { minutes: 720, label: '12 小时' },
] as const;

export const DEFAULT_REMINDER_LEAD_MINUTES = 60;
export const MAX_SCHEDULED_REMINDERS = 50;

export function normalizeReminderLead(minutes: number): number {
  return REMINDER_LEAD_OPTIONS.some((option) => option.minutes === minutes)
    ? minutes
    : DEFAULT_REMINDER_LEAD_MINUTES;
}

export function planStartMs(plan: PlannedShift): number {
  const date = parseISODate(plan.date);
  const [hours, minutes] = plan.start.split(':').map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.getTime();
}

export interface ReminderCandidate {
  plan: PlannedShift;
  notifyAt: number;
  leadMinutes: number;
}

export function buildReminderCandidates(
  plans: PlannedShift[],
  nowMs: number,
  leadMinutes: number,
  limit = MAX_SCHEDULED_REMINDERS,
): ReminderCandidate[] {
  const fallbackLead = normalizeReminderLead(leadMinutes);
  return plans
    .filter((plan) => plan.reminderEnabled !== false)
    .map((plan) => {
      const planLead =
        typeof plan.reminderLeadMinutes === 'number'
          ? normalizeReminderLead(plan.reminderLeadMinutes)
          : fallbackLead;
      return {
        plan,
        leadMinutes: planLead,
        notifyAt: planStartMs(plan) - planLead * 60_000,
      };
    })
    .filter((candidate) => candidate.notifyAt > nowMs)
    .sort((a, b) => a.notifyAt - b.notifyAt)
    .slice(0, Math.max(0, limit));
}

export function reminderIdForPlan(planId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < planId.length; index += 1) {
    hash ^= planId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 2_147_483_646 + 1;
}

function dateLabelFrom(plan: PlannedShift, notifyAt: number): string {
  const notifyDate = toISODate(new Date(notifyAt));
  if (plan.date === notifyDate) return '今天';
  if (plan.date === addDaysISO(notifyDate, 1)) return '明天';
  const date = parseISODate(plan.date);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function buildReminderContent(
  plan: PlannedShift,
  notifyAt: number,
  leadMinutes: number,
): { title: string; body: string } {
  const leadLabel =
    REMINDER_LEAD_OPTIONS.find((option) => option.minutes === leadMinutes)?.label ??
    `${leadMinutes} 分钟`;
  return {
    title: `${leadLabel}后上班`,
    body: `${dateLabelFrom(plan, notifyAt)} ${plan.shiftName} ${formatTimeRange(
      plan.start,
      plan.end,
    )} · 预计 ¥${formatMoney(earningsOf(plan))}`,
  };
}
