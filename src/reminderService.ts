import { Capacitor, type PermissionState } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PlannedShift } from './types';
import {
  buildReminderCandidates,
  buildReminderContent,
  reminderIdForPlan,
} from './reminders';

export type ReminderPermission = PermissionState | 'unsupported';

export interface ReminderStatus {
  supported: boolean;
  permission: ReminderPermission;
  exactAlarm: PermissionState | null;
  scheduled: number;
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

async function checkExactAlarm(): Promise<PermissionState | null> {
  try {
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm;
  } catch {
    return null;
  }
}

async function cancelManagedNotifications(): Promise<void> {
  const pending = await LocalNotifications.getPending();
  const managed = pending.notifications.filter(
    (notification) =>
      (notification.extra as { type?: string } | undefined)?.type === REMINDER_EXTRA_TYPE,
  );
  if (managed.length === 0) return;
  await LocalNotifications.cancel({
    notifications: managed.map((notification) => ({ id: notification.id })),
  });
}

export async function getReminderStatus(): Promise<ReminderStatus> {
  if (!isReminderSupported()) return unsupportedStatus();
  try {
    const permission = await LocalNotifications.checkPermissions();
    const exactAlarm = await checkExactAlarm();
    const pending = await LocalNotifications.getPending();
    const scheduled = pending.notifications.filter(
      (notification) =>
        (notification.extra as { type?: string } | undefined)?.type === REMINDER_EXTRA_TYPE,
    ).length;
    return {
      supported: true,
      permission: permission.display,
      exactAlarm,
      scheduled,
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
    await cancelManagedNotifications();

    if (!enabled || permission.display !== 'granted') {
      return {
        supported: true,
        permission: permission.display,
        exactAlarm,
        scheduled: 0,
      };
    }

    const candidates = buildReminderCandidates(plans, Date.now(), leadMinutes);
    if (candidates.length > 0) {
      await LocalNotifications.schedule({
        notifications: candidates.map((candidate) => {
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
        }),
      });
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
