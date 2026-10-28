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
  // 保底路径要拿到「上一次有效的状态」，用 ref 而不是把 status 塞进依赖里
  const statusRef = useRef(status);
  const commitStatus = useCallback((next: ReminderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    void syncPlannedReminders(plans, enabled, leadMinutes)
      .then((next) => {
        if (!disposed) commitStatus(next);
      })
      .catch(() => {
        // 原生插件在部分机型上会直接 reject：保留上次状态，不让异常冒成未捕获拒绝
      });
    return () => {
      disposed = true;
    };
  }, [plans, enabled, leadMinutes, commitStatus]);

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
      void syncPlannedReminders(current.plans, current.enabled, current.leadMinutes)
        .then((next) => {
          statusRef.current = next;
          setStatus(next);
        })
        .catch(() => {
          // 回前台重建通知失败时维持原状态，用户仍可在设置页手动重试
        });
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

  // 通知权限流程同样兜底：原生调用失败时返回上一次状态，调用方不必再包 try/catch
  const requestPermission = useCallback(async () => {
    try {
      const next = await requestReminderPermission();
      commitStatus(next);
      return next;
    } catch {
      return statusRef.current;
    }
  }, [commitStatus]);

  const requestExactAlarm = useCallback(async () => {
    try {
      const next = await requestExactAlarmSetting();
      commitStatus(next);
      return next;
    } catch {
      return statusRef.current;
    }
  }, [commitStatus]);

  return { status, requestPermission, requestExactAlarm };
}
