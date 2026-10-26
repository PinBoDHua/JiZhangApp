import { Capacitor, type PermissionState } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PlannedShift } from './types';
import {
  buildReminderCandidates,
  buildReminderContent,
  reminderIdForPlan,
  type ReminderCandidate,
} from './reminders';

export type ReminderPermission = PermissionState | 'unsupported';

export interface ReminderStatus {
  supported: boolean;
  permission: ReminderPermission;
  exactAlarm: PermissionState | null;
  scheduled: number;
}

interface PendingNotification {
  id: number;
  schedule?: { at?: unknown };
  extra?: unknown;
}

const REMINDER_EXTRA_TYPE = 'shift-reminder';

export function isReminderSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function initialReminderStatus(): ReminderStatus {
  return {
    supported: isReminderSupported(),
    permission: isReminderSupported() ? 'prompt' : 'unsupported',
    exactAlarm: null,
    scheduled: 0,
  };
}

function unsupportedStatus(): ReminderStatus {
  return { supported: false, permission: 'unsupported', exactAlarm: null, scheduled: 0 };
}

function isManaged(notification: PendingNotification): boolean {
  const extra = notification.extra as { type?: string } | undefined;
  return extra?.type === REMINDER_EXTRA_TYPE;
}

async function checkExactAlarm(): Promise<PermissionState | null> {
  try {
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm;
  } catch {
    return null;
  }
}

async function pendingManaged(): Promise<PendingNotification[]> {
  const pending = await LocalNotifications.getPending();
  return (pending.notifications as PendingNotification[]).filter(isManaged);
}

async function cancelAll(notifications: PendingNotification[]): Promise<void> {
  if (notifications.length === 0) return;
  await LocalNotifications.cancel({
    notifications: notifications.map((notification) => ({ id: notification.id })),
  });
}

function scheduledAtMs(notification: PendingNotification): number | null {
  const at = notification.schedule?.at;
  if (at instanceof Date) return Number.isFinite(at.getTime()) ? at.getTime() : null;
  if (typeof at === 'string' || typeof at === 'number') {
    const parsed = new Date(at).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * 已排的提醒与目标一致时跳过取消/重建，避免每次回到前台都重排通知。
 */
function sameSchedule(
  managed: PendingNotification[],
  candidates: ReminderCandidate[],
): boolean {
  if (managed.length !== candidates.length) return false;
  const desired = new Map(
    candidates.map((candidate) => [reminderIdForPlan(candidate.plan.id), candidate.notifyAt]),
  );
  if (desired.size !== managed.length) return false;
  return managed.every((notification) => {
    const expected = desired.get(notification.id);
    if (expected === undefined) return false;
    const actual = scheduledAtMs(notification);
    return actual !== null && Math.abs(actual - expected) < 1000;
  });
}

function toNotification(candidate: ReminderCandidate) {
  const content = buildReminderContent(
    candidate.plan,
    candidate.notifyAt,
    candidate.leadMinutes,
  );
  return {
    id: reminderIdForPlan(candidate.plan.id),
    title: content.title,
    body: content.body,
    schedule: {
      at: new Date(candidate.notifyAt),
      allowWhileIdle: true,
    },
    autoCancel: true,
    extra: {
      type: REMINDER_EXTRA_TYPE,
      planId: candidate.plan.id,
      date: candidate.plan.date,
    },
  };
}

export async function getReminderStatus(): Promise<ReminderStatus> {
  if (!isReminderSupported()) return unsupportedStatus();
  try {
    const permission = await LocalNotifications.checkPermissions();
    const exactAlarm = await checkExactAlarm();
    const managed = await pendingManaged();
    return {
      supported: true,
      permission: permission.display,
      exactAlarm,
      scheduled: managed.length,
    };
  } catch {
    return { supported: true, permission: 'denied', exactAlarm: null, scheduled: 0 };
  }
}

export async function requestReminderPermission(): Promise<ReminderStatus> {
  if (!isReminderSupported()) return unsupportedStatus();
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
    return getReminderStatus();
  } catch {
    return { supported: true, permission: 'denied', exactAlarm: null, scheduled: 0 };
  }
}

async function performSync(
  plans: PlannedShift[],
  enabled: boolean,
  leadMinutes: number,
): Promise<ReminderStatus> {
  if (!isReminderSupported()) return unsupportedStatus();
  try {
    const permission = await LocalNotifications.checkPermissions();
    const exactAlarm = await checkExactAlarm();
    const managed = await pendingManaged();

    if (!enabled || permission.display !== 'granted') {
      await cancelAll(managed);
      return {
        supported: true,
        permission: permission.display,
        exactAlarm,
        scheduled: 0,
      };
    }

    const candidates = buildReminderCandidates(plans, Date.now(), leadMinutes);
    if (!sameSchedule(managed, candidates)) {
      await cancelAll(managed);
      if (candidates.length > 0) {
        await LocalNotifications.schedule({
          notifications: candidates.map(toNotification),
        });
      }
    }

    return {
      supported: true,
      permission: permission.display,
      exactAlarm,
      scheduled: candidates.length,
    };
  } catch {
    return { supported: true, permission: 'denied', exactAlarm: null, scheduled: 0 };
  }
}

let syncQueue: Promise<unknown> = Promise.resolve();

export function syncPlannedReminders(
  plans: PlannedShift[],
  enabled: boolean,
  leadMinutes: number,
): Promise<ReminderStatus> {
  const task = syncQueue.then(
    () => performSync(plans, enabled, leadMinutes),
    () => performSync(plans, enabled, leadMinutes),
  );
  syncQueue = task.catch(() => undefined);
  return task;
}

export async function requestExactAlarmSetting(): Promise<ReminderStatus> {
  if (!isReminderSupported()) return unsupportedStatus();
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    // 用户可能直接返回，状态以重新检查为准
  }
  return getReminderStatus();
}
