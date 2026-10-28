import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  initialReminderStatus,
  requestExactAlarmSetting,
  requestReminderPermission,
  syncPlannedReminders,
  type ReminderStatus,
} from '../reminderService';
import { isISODate } from '../storage';
import type { PlannedShift } from '../types';

interface ReminderSyncOptions {
  plans: PlannedShift[];
  enabled: boolean;
  leadMinutes: number;
  /** 点通知时跳到对应日期的排班 */
  onOpenPlanDate: (date: string) => void;
}

/**
 * 系统排班提醒：排班或设置变化时重建通知，原生监听只注册一次。
 * 具体到某个排班是否提醒由 reminderService 统一计算。
 */
export function useReminderSync({
  plans,
  enabled,
  leadMinutes,
  onOpenPlanDate,
}: ReminderSyncOptions) {
  const [status, setStatus] = useState<ReminderStatus>(() => initialReminderStatus());

  useEffect(() => {
    let disposed = false;
    void syncPlannedReminders(plans, enabled, leadMinutes).then((next) => {
      if (!disposed) setStatus(next);
    });
    return () => {
      disposed = true;
    };
  }, [plans, enabled, leadMinutes]);

  // 原生监听只注册一次，回前台时从 ref 取最新的排班和设置
  const inputRef = useRef({ plans, enabled, leadMinutes });
  useEffect(() => {
    inputRef.current = { plans, enabled, leadMinutes };
  }, [plans, enabled, leadMinutes]);

  const openRef = useRef(onOpenPlanDate);
  useEffect(() => {
    openRef.current = onOpenPlanDate;
  }, [onOpenPlanDate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const handles: { remove: () => void }[] = [];
    const keep = (handle: { remove: () => void }) => {
      if (disposed) {
        handle.remove();
      } else {
        handles.push(handle);
      }
    };

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      const current = inputRef.current;
      void syncPlannedReminders(current.plans, current.enabled, current.leadMinutes).then(
        setStatus,
      );
    }).then(keep);

    void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification.extra as { type?: string; date?: string } | undefined;
      // 通知的 extra 来自系统，可能与当前数据不同步：日期不合法时直接忽略，避免日历跳到 NaN 年月
      if (!extra || extra.type !== 'shift-reminder' || !isISODate(extra.date)) return;
      openRef.current(extra.date);
    }).then(keep);

    return () => {
      disposed = true;
      handles.forEach((handle) => handle.remove());
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const next = await requestReminderPermission();
    setStatus(next);
    return next;
  }, []);

  const requestExactAlarm = useCallback(async () => {
    const next = await requestExactAlarmSetting();
    setStatus(next);
    return next;
  }, []);

  return { status, requestPermission, requestExactAlarm };
}
