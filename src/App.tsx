import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BottomNav } from './components/BottomNav';
import { Calendar, type CalendarMode } from './components/Calendar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EndTimingSheet } from './components/EndTimingSheet';
import { GoalSheet } from './components/GoalSheet';
import { Home } from './components/Home';
import { MissedPlansSheet } from './components/MissedPlansSheet';
import { PlanSheet } from './components/PlanSheet';
import { RecordSheet } from './components/RecordSheet';
import { RotationSheet } from './components/RotationSheet';
import { Settings } from './components/Settings';
import { SettlementSheet, type SettlementInput } from './components/SettlementSheet';
import { StartTimingSheet } from './components/StartTimingSheet';
import { Stats } from './components/Stats';
import { TemplateSheet, type TemplateInput } from './components/TemplateSheet';
import { Toast } from './components/Toast';
import { applyNativeStatusBar, exportFile } from './native';
import { restorePendingPlan, toPlanHistoryEntry } from './planStats';
import { normalizeReminderLead } from './reminders';
import {
  initialReminderStatus,
  requestExactAlarmSetting,
  requestReminderPermission,
  syncPlannedReminders,
  type ReminderStatus,
} from './reminderService';
import type { RotationShift } from './rotation';
import {
  buildBackup,
  loadActiveShift,
  loadPlanHistory,
  loadPlans,
  loadPreferences,
  loadRecords,
  loadSettlements,
  loadTemplates,
  parseBackup,
  saveActiveShift,
  savePlanHistory,
  savePlans,
  savePreferences,
  saveRecords,
  saveSettlements,
  saveTemplates,
} from './storage';
import type {
  ActiveShift,
  MonthlySettlement,
  PlanHistoryEntry,
  PlanHistoryStatus,
  PlanInput,
  PlannedShift,
  RecordInput,
  SettlementOpenContext,
  ShiftTemplate,
  StatsPeriod,
  Tab,
  ThemePreference,
  WorkRecord,
} from './types';
import {
  canStartPlan,
  findLatestRecord,
  formatDateCN,
  formatTimeHM,
  rawMinutes,
  sortPlans,
  toISODate,
  todayISO,
  toCsv,
  uid,
} from './utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface ToastState {
  message: string;
  id: number;
  actionLabel?: string;
  onAction?: () => void;
}

type SheetState =
  | {
      kind: 'record';
      record?: WorkRecord;
      plan?: PlannedShift;
      template?: ShiftTemplate | null;
      date?: string;
    }
  | { kind: 'plan'; plan?: PlannedShift; date?: string }
  | { kind: 'rotation'; date?: string }
  | { kind: 'missed' }
  | { kind: 'template'; template?: ShiftTemplate }
  | { kind: 'goal' }
  | { kind: 'startTiming' }
  | { kind: 'endTiming'; shift: ActiveShift; endTime: string; endAt: number }
  | {
      kind: 'settlement';
      context: SettlementOpenContext;
      settlement?: MonthlySettlement;
    };

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

export default function App() {
  const [records, setRecords] = useState<WorkRecord[]>(() => loadRecords());
  const [templates, setTemplates] = useState<ShiftTemplate[]>(() => loadTemplates());
  const [preferences, setPreferences] = useState(() => loadPreferences());
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(() => loadActiveShift());
  const [settlements, setSettlements] = useState<MonthlySettlement[]>(() => loadSettlements());
  const [plans, setPlans] = useState<PlannedShift[]>(() => loadPlans());
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>(() => loadPlanHistory());
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus>(() =>
    initialReminderStatus(),
  );
  const [calendarFocus, setCalendarFocus] = useState<{
    date: string;
    token: number;
  } | null>(null);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [tab, setTab] = useState<Tab>('home');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('month');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('records');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(
    () => Capacitor.isNativePlatform() || readStandalone(),
  );
  const mainRef = useRef<HTMLElement>(null);
  const resolvedTheme =
    preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme;
  const latestRecord = findLatestRecord(records);
  const latestTemplate = latestRecord?.templateId
    ? templates.find((template) => template.id === latestRecord.templateId)
    : undefined;
  const defaultTemplate = latestTemplate ?? templates[0] ?? null;
  const goToTab = useCallback((next: Tab) => {
    if (next !== 'calendar') setCalendarFocus(null);
    setTab(next);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let remove: (() => void) | undefined;
    void CapacitorApp.addListener('backButton', () => {
      if (confirm) {
        setConfirm(null);
        return;
      }
      if (sheet) {
        setSheet(null);
        return;
      }
      if (tab !== 'home') {
        goToTab('home');
        return;
      }
      void CapacitorApp.exitApp();
    }).then((handle) => {
      remove = () => void handle.remove();
      if (disposed) remove();
    });
    return () => {
      disposed = true;
      remove?.();
    };
  }, [confirm, sheet, tab, goToTab]);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveTemplates(templates);
  }, [templates]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    saveActiveShift(activeShift);
  }, [activeShift]);

  useEffect(() => {
    saveSettlements(settlements);
  }, [settlements]);

  useEffect(() => {
    savePlans(sortPlans(plans));
  }, [plans]);

  useEffect(() => {
    savePlanHistory(planHistory);
  }, [planHistory]);

  useEffect(() => {
    let disposed = false;
    void syncPlannedReminders(
      plans,
      preferences.reminderEnabled,
      preferences.reminderLeadMinutes,
    ).then((status) => {
      if (!disposed) setReminderStatus(status);
    });
    return () => {
      disposed = true;
    };
  }, [plans, preferences.reminderEnabled, preferences.reminderLeadMinutes]);

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
      void syncPlannedReminders(
        plans,
        preferences.reminderEnabled,
        preferences.reminderLeadMinutes,
      ).then(setReminderStatus);
    }).then(keep);

    void LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const extra = action.notification.extra as
          | { type?: string; date?: string }
          | undefined;
        if (extra?.type !== 'shift-reminder' || typeof extra.date !== 'string') return;
        setSheet(null);
        goToTab('calendar');
        setCalendarMode('plans');
        setCalendarFocus({ date: extra.date, token: Date.now() });
      },
    ).then(keep);

    return () => {
      disposed = true;
      handles.forEach((handle) => handle.remove());
    };
  }, [plans, preferences.reminderEnabled, preferences.reminderLeadMinutes, goToTab]);

  useEffect(() => {
    document.title = activeShift
      ? activeShift.pausedAt
        ? '已暂停 · 工时账本'
        : '计时中 · 工时账本'
      : '工时账本 · 班次与收入记录';
  }, [activeShift]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', resolvedTheme === 'dark' ? '#0f1512' : '#f4f0e7');
    void applyNativeStatusBar(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast(null),
      toast.actionLabel ? 6000 : 2600,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const notify = useCallback((message: string) => {
    setToast({ message, id: Date.now() });
  }, []);

  const notifyWithAction = useCallback(
    (message: string, actionLabel: string, onAction: () => void) => {
      setToast({ message, id: Date.now(), actionLabel, onAction });
    },
    [],
  );

  const closeSheet = useCallback(() => setSheet(null), []);
  const archivePlan = useCallback(
    (plan: PlannedShift, status: PlanHistoryStatus, recordId: string | null) => {
      const entry = toPlanHistoryEntry(plan, status, recordId);
      setPlans((prev) => prev.filter((item) => item.id !== plan.id));
      setPlanHistory((prev) => [
        ...prev.filter((item) => item.id !== entry.id),
        entry,
      ]);
    },
    [],
  );

  const requestSkipPlan = useCallback(
    (plan: PlannedShift) => {
      setConfirm({
        title: `把「${plan.shiftName}」标记为未上？`,
        message: `${formatDateCN(plan.date)} 的这一班不会生成记录，将计入未上班次。`,
        confirmLabel: '标记未上',
        danger: true,
        onConfirm: () => {
          archivePlan(plan, 'skipped', null);
          setConfirm(null);
          notify('已标记为未上');
        },
      });
    },
    [archivePlan, notify],
  );

  const openMissedPlans = () => setSheet({ kind: 'missed' });

  const openNewRecord = (template: ShiftTemplate | null, date = toISODate(new Date())) => {
    setSheet({ kind: 'record', template, date });
  };

  const openNewPlan = (date = toISODate(new Date())) => {
    setSheet({ kind: 'plan', date });
  };

  const openRotation = (date = toISODate(new Date())) => {
    setSheet({ kind: 'rotation', date });
  };

  const openPlan = (plan: PlannedShift) => {
    setSheet({ kind: 'plan', plan });
  };

  const openTemplate = (template?: ShiftTemplate) => {
    setSheet({ kind: 'template', template });
  };

  const openStats = (period: StatsPeriod) => {
    setStatsPeriod(period);
    goToTab('stats');
  };

  const openSettlement = (context: SettlementOpenContext) => {
    const settlement = settlements.find((item) => item.monthKey === context.monthKey);
    setSheet({ kind: 'settlement', context, settlement });
  };

  const handleSaveSettlement = (input: SettlementInput) => {
    if (!sheet || sheet.kind !== 'settlement') return;
    const saved: MonthlySettlement = {
      ...input,
      monthKey: sheet.context.monthKey,
      updatedAt: Date.now(),
    };
    setSettlements((prev) =>
      [...prev.filter((item) => item.monthKey !== saved.monthKey), saved].sort((a, b) =>
        a.monthKey.localeCompare(b.monthKey),
      ),
    );
    setSheet(null);
    notify('工资结算已保存');
  };

  const handleSharePayslip = async (text: string) => {
    if (!sheet || sheet.kind !== 'settlement') return;
    try {
      await exportFile(
        `工资条-${sheet.context.monthLabel}.txt`,
        text,
        'text/plain;charset=utf-8',
      );
      notify(Capacitor.isNativePlatform() ? '工资条已生成' : '工资条已导出');
    } catch (error) {
      if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
      notify('工资条导出失败，请重试');
    }
  };

  const handleSaveGoal = (goal: number) => {
    setPreferences((prev) => ({ ...prev, monthlyGoal: goal }));
    setSheet(null);
    notify(goal > 0 ? '月收入目标已更新' : '已清除月收入目标');
  };

  const handleThemeChange = (theme: ThemePreference) => {
    setPreferences((prev) => ({ ...prev, theme }));
  };

  const handleToggleReminder = async () => {
    if (!reminderStatus.supported) {
      notify('系统提醒仅支持 Android App');
      return;
    }
    if (preferences.reminderEnabled) {
      setPreferences((prev) => ({ ...prev, reminderEnabled: false }));
      notify('排班提醒已关闭');
      return;
    }
    const status = await requestReminderPermission();
    setReminderStatus(status);
    if (status.permission === 'granted') {
      setPreferences((prev) => ({ ...prev, reminderEnabled: true }));
      notify('排班提醒已开启');
    } else {
      notify('请在系统设置中允许通知');
    }
  };

  const handleReminderLeadChange = (minutes: number) => {
    setPreferences((prev) => ({
      ...prev,
      reminderLeadMinutes: normalizeReminderLead(minutes),
    }));
  };

  const handleRequestExactAlarm = async () => {
    const status = await requestExactAlarmSetting();
    setReminderStatus(status);
    if (status.exactAlarm === 'granted') {
      notify('精确提醒已开启');
    } else {
      notify('未开启精确提醒，通知可能略有延迟');
    }
  };

  const handleSavePlan = (input: PlanInput, dates: string[]) => {
    if (!sheet || sheet.kind !== 'plan') return;
    if (sheet.plan) {
      const id = sheet.plan.id;
      const timestamp = Date.now();
      setPlans((prev) =>
        sortPlans(
          prev.map((plan) =>
            plan.id === id ? { ...plan, ...input, updatedAt: timestamp } : plan,
          ),
        ),
      );
      notify('排班已更新');
    } else {
      const timestamp = Date.now();
      const created = dates.map((date) => ({
        ...input,
        date,
        id: uid(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      setPlans((prev) => sortPlans([...prev, ...created]));
      notify(created.length > 1 ? `已排 ${created.length} 个班次` : '排班已保存');
    }
    setSheet(null);
  };

  const handleGenerateRotation = (entries: RotationShift[]) => {
    const occupied = new Set(plans.map((plan) => plan.date));
    const timestamp = Date.now();
    const created: PlannedShift[] = entries
      .filter((entry) => !occupied.has(entry.date))
      .map((entry) => ({
        id: uid(),
        date: entry.date,
        templateId: entry.template.id,
        shiftName: entry.template.name,
        shiftColor: entry.template.color,
        start: entry.template.start,
        end: entry.template.end,
        breakMinutes: entry.template.breakMinutes,
        rate: entry.template.rate,
        multiplier: 1,
        note: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

    if (created.length === 0) {
      notify('所选范围没有可生成的排班');
      return;
    }

    setPlans((prev) => sortPlans([...prev, ...created]));
    setSheet(null);
    const createdIds = new Set(created.map((plan) => plan.id));
    notifyWithAction(`已生成 ${created.length} 个排班`, '撤销', () => {
      setPlans((prev) => prev.filter((plan) => !createdIds.has(plan.id)));
    });
  };

  const requestDeletePlan = () => {
    if (!sheet || sheet.kind !== 'plan' || !sheet.plan) return;
    const target = sheet.plan;
    setConfirm({
      title: `删除「${target.shiftName}」排班？`,
      message: `${formatDateCN(target.date)} 的这一班会从日历中移除，已有记录不受影响。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        setPlans((prev) => prev.filter((plan) => plan.id !== target.id));
        setSheet(null);
        setConfirm(null);
        notify('排班已删除');
      },
    });
  };

  const handleStartPlan = (plan: PlannedShift) => {
    if (activeShift) {
      setSheet(null);
      notify('已有计时进行中，先结束或放弃当前打卡');
      return;
    }
    const now = new Date();
    if (!canStartPlan(plan, now)) {
      setSheet(null);
      notify('还没到排班日期，当天再来打卡');
      return;
    }
    setActiveShift({
      templateId: plan.templateId,
      sourcePlanId: plan.id,
      shiftName: plan.shiftName,
      shiftColor: plan.shiftColor,
      startDate: toISODate(now),
      startTime: formatTimeHM(now),
      startedAt: now.getTime(),
      pausedAt: null,
      pausedMs: 0,
      breakMinutes: plan.breakMinutes,
      rate: plan.rate,
      multiplier: plan.multiplier,
      note: plan.note,
    });
    setSheet(null);
    notify(`${plan.shiftName} 打卡已开始`);
  };

  const handleRecordPlan = (plan: PlannedShift) => {
    setSheet({ kind: 'record', plan, date: plan.date });
  };

  const handleStartTiming = (template: ShiftTemplate) => {
    if (activeShift) {
      setSheet(null);
      return;
    }
    const now = new Date();
    setActiveShift({
      templateId: template.id,
      sourcePlanId: null,
      shiftName: template.name,
      shiftColor: template.color,
      startDate: toISODate(now),
      startTime: formatTimeHM(now),
      startedAt: now.getTime(),
      pausedAt: null,
      pausedMs: 0,
      breakMinutes: template.breakMinutes,
      rate: template.rate,
      multiplier: 1,
      note: '',
    });
    setSheet(null);
    notify('打卡已开始');
  };

  const handlePauseTiming = () => {
    if (!activeShift || activeShift.pausedAt) return;
    setActiveShift({ ...activeShift, pausedAt: Date.now() });
    notify('已开始休息');
  };

  const handleResumeTiming = () => {
    if (!activeShift?.pausedAt) return;
    const now = Date.now();
    setActiveShift({
      ...activeShift,
      pausedAt: null,
      pausedMs: activeShift.pausedMs + Math.max(0, now - activeShift.pausedAt),
    });
    notify('继续计时');
  };

  const handleRequestEndTiming = () => {
    if (!activeShift) return;
    const now = new Date();
    const elapsedMs = now.getTime() - activeShift.startedAt;
    if (elapsedMs < 60_000) {
      notify('计时还不到 1 分钟，稍后再结束');
      return;
    }
    if (elapsedMs >= 24 * 60 * 60 * 1000) {
      notify('计时超过 24 小时，请手动核对后再记录');
      return;
    }

    const endTime = formatTimeHM(now);
    if (rawMinutes(activeShift.startTime, endTime) <= 0) {
      notify('计时太短，稍后再结束');
      return;
    }

    const pausedShift = activeShift.pausedAt
      ? activeShift
      : { ...activeShift, pausedAt: now.getTime() };
    if (!activeShift.pausedAt) setActiveShift(pausedShift);
    setSheet({ kind: 'endTiming', shift: pausedShift, endTime, endAt: now.getTime() });
  };

  const handleSaveTimingEnd = (input: {
    breakMinutes: number;
    multiplier: number;
    note: string;
  }) => {
    if (sheet?.kind !== 'endTiming') return;
    const { shift, endTime } = sheet;
    const totalMinutes = rawMinutes(shift.startTime, endTime);
    if (totalMinutes <= 0 || input.breakMinutes < 0 || input.breakMinutes >= totalMinutes) {
      notify('休息时长无效，请检查');
      return;
    }
    const timestamp = Date.now();
    const recordId = uid();
    const sourcePlan = shift.sourcePlanId
      ? plans.find((plan) => plan.id === shift.sourcePlanId)
      : undefined;
    setRecords((prev) => [
      {
        id: recordId,
        date: shift.startDate,
        templateId: shift.templateId,
        shiftName: shift.shiftName,
        shiftColor: shift.shiftColor,
        start: shift.startTime,
        end: endTime,
        breakMinutes: input.breakMinutes,
        rate: shift.rate,
        multiplier: input.multiplier,
        note: input.note,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...prev,
    ]);
    if (sourcePlan) {
      archivePlan(sourcePlan, 'completed', recordId);
    }
    setActiveShift(null);
    setSheet(null);
    notify(sourcePlan ? '已结束打卡，排班已完成' : '已结束打卡，记录已保存');
  };

  const requestAbandonTiming = () => {
    if (!activeShift) return;
    const target = activeShift;
    setConfirm({
      title: '放弃这次打卡？',
      message: `${target.shiftName} · ${target.startTime} 开始的计时将被清除，不会生成记录。`,
      confirmLabel: '放弃',
      danger: true,
      onConfirm: () => {
        setActiveShift(null);
        setConfirm(null);
        notify('已放弃这次计时');
      },
    });
  };

  const handleSaveRecord = (input: RecordInput) => {
    if (!sheet || sheet.kind !== 'record') return;
    const sourcePlan = sheet.plan;
    if (sheet.record) {
      const id = sheet.record.id;
      setRecords((prev) =>
        prev.map((record) =>
          record.id === id ? { ...record, ...input, updatedAt: Date.now() } : record,
        ),
      );
      notify('记录已更新');
    } else {
      const now = Date.now();
      const recordId = uid();
      setRecords((prev) => [
        { ...input, id: recordId, createdAt: now, updatedAt: now },
        ...prev,
      ]);
      if (sourcePlan) {
        archivePlan(sourcePlan, 'completed', recordId);
      }
      notify(sourcePlan ? '排班已完成，记录已保存' : '已记下一班');
    }
    setSheet(null);
  };

  const handleSaveTemplate = (input: TemplateInput) => {
    if (!sheet || sheet.kind !== 'template') return;
    if (sheet.template) {
      const id = sheet.template.id;
      setTemplates((prev) =>
        prev.map((template) => (template.id === id ? { ...template, ...input } : template)),
      );
      notify('班次已更新');
    } else {
      setTemplates((prev) => [...prev, { ...input, id: uid() }]);
      notify('班次已添加');
    }
    setSheet(null);
  };

  const requestDeleteTemplate = () => {
    if (!sheet || sheet.kind !== 'template' || !sheet.template) return;
    const target = sheet.template;
    setConfirm({
      title: `删除「${target.name}」？`,
      message: '已有记录不会受影响，之后的记账中不再出现这个班次。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        setTemplates((prev) => prev.filter((template) => template.id !== target.id));
        setSheet(null);
        setConfirm(null);
        notify('班次已删除');
      },
    });
  };

  const handleDeleteRecord = () => {
    if (!sheet || sheet.kind !== 'record' || !sheet.record) return;
    const target = sheet.record;
    const linkedHistory = planHistory.find((entry) => entry.recordId === target.id);
    setRecords((prev) => prev.filter((record) => record.id !== target.id));
    if (linkedHistory) {
      setPlanHistory((prev) => prev.filter((entry) => entry.id !== linkedHistory.id));
      setPlans((prev) =>
        sortPlans([...prev.filter((plan) => plan.id !== linkedHistory.id), restorePendingPlan(linkedHistory)]),
      );
    }
    setSheet(null);
    notifyWithAction(
      linkedHistory ? '记录已删除，排班已恢复' : '记录已删除',
      '撤销',
      () => {
        setRecords((prev) =>
          prev.some((record) => record.id === target.id) ? prev : [...prev, target],
        );
        if (linkedHistory) {
          setPlans((prev) => prev.filter((plan) => plan.id !== linkedHistory.id));
          setPlanHistory((prev) =>
            prev.some((entry) => entry.id === linkedHistory.id)
              ? prev
              : [...prev, linkedHistory],
          );
        }
      },
    );
  };

  const handleExportJson = async () => {
    const backup = buildBackup(
      records,
      templates,
      {
        monthlyGoal: preferences.monthlyGoal,
        theme: preferences.theme,
      },
      settlements,
      plans,
      planHistory,
    );
    try {
      await exportFile(
        `工时账本-备份-${todayISO()}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
      );
      setPreferences((prev) => ({ ...prev, lastBackupAt: Date.now() }));
      notify(Capacitor.isNativePlatform() ? '备份已生成' : '备份已导出');
    } catch (error) {
      if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
      notify('导出失败，请重试');
    }
  };

  const handleExportCsv = async () => {
    try {
      await exportFile(
        `工时账本-${todayISO()}.csv`,
        `\uFEFF${toCsv(records)}`,
        'text/csv;charset=utf-8',
      );
      notify(Capacitor.isNativePlatform() ? '表格已生成' : '表格已导出');
    } catch (error) {
      if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
      notify('导出失败，请重试');
    }
  };

  const handleImportFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      notify('文件太大，请选择备份文件');
      return;
    }
    try {
      const backup = parseBackup(await file.text());
      const settlementCount = backup.settlements?.length ?? 0;
      const planCount = backup.plans?.length ?? 0;
      const historyCount = backup.planHistory?.length ?? 0;
      setConfirm({
        title: '导入并覆盖当前数据？',
        message: `备份包含 ${backup.records.length} 条记录、${backup.templates.length} 种班次${
          backup.preferences ? '、目标和外观设置' : ''
        }${settlementCount > 0 ? `、${settlementCount} 个月工资结算` : ''}${
          planCount > 0 ? `、${planCount} 个排班` : ''
        }${historyCount > 0 ? `、${historyCount} 条完成排班历史` : ''}。导入后会替换记录、结算和完成历史${
          backup.plans ? '' : '，现有排班将保留'
        }${
          !backup.planHistory && planHistory.length > 0
            ? '（备份不含完成历史，现有完成历史将清空）'
            : ''
        }，且无法撤销。`,
        confirmLabel: '导入',
        danger: true,
        onConfirm: () => {
          setRecords(backup.records);
          setTemplates(backup.templates);
          if (backup.preferences) {
            setPreferences((prev) => ({
              ...prev,
              monthlyGoal: backup.preferences?.monthlyGoal ?? prev.monthlyGoal,
              theme: backup.preferences?.theme ?? prev.theme,
            }));
          }
          setSettlements(backup.settlements ?? []);
          if (backup.plans) setPlans(backup.plans);
          setPlanHistory(backup.planHistory ?? []);
          setConfirm(null);
          goToTab('home');
          notify('备份已导入');
        },
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入失败，请检查文件');
    }
  };

  const requestClearRecords = () => {
    if (records.length === 0) return;
    const keepHint =
      plans.length > 0
        ? `班次设置和 ${plans.length} 个排班计划会保留`
        : '班次设置会保留';
    const historyHint =
      planHistory.length > 0 ? `和 ${planHistory.length} 条完成排班历史` : '';
    setConfirm({
      title: '清空所有记录？',
      message: `将删除全部 ${records.length} 条记录${historyHint}，${keepHint}。此操作无法撤销，建议先导出备份。`,
      confirmLabel: '清空',
      danger: true,
      onConfirm: () => {
        setRecords([]);
        setPlanHistory([]);
        setConfirm(null);
        notify('记录已清空');
      },
    });
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsStandalone(true);
    }
    setInstallPrompt(null);
  };

  return (
    <div className="app-shell">
      <main className="app-main" ref={mainRef}>
        <div className="screen-slot" key={tab}>
          {tab === 'home' ? (
            <Home
              records={records}
              templates={templates}
              plans={plans}
              monthlyGoal={preferences.monthlyGoal}
              activeShift={activeShift}
              onAdd={openNewRecord}
              onEditRecord={(record) => setSheet({ kind: 'record', record })}
              onGoStats={() => openStats('month')}
              onGoWeekStats={() => openStats('week')}
              onStartTiming={() => setSheet({ kind: 'startTiming' })}
              onStartPlan={handleStartPlan}
              onRecordPlan={handleRecordPlan}
              onEditPlan={openPlan}
              onOpenMissed={openMissedPlans}
              onClockOut={handleRequestEndTiming}
              onPauseTiming={handlePauseTiming}
              onResumeTiming={handleResumeTiming}
              onAbandonTiming={requestAbandonTiming}
            />
          ) : null}
          {tab === 'calendar' ? (
            <Calendar
              key={calendarFocus?.token ?? 'calendar'}
              records={records}
              plans={plans}
              templates={templates}
              mode={calendarMode}
              timingActive={Boolean(activeShift)}
              activePlanId={activeShift?.sourcePlanId ?? null}
              reminderEnabled={preferences.reminderEnabled}
              focusRequest={calendarFocus}
              onModeChange={setCalendarMode}
              onEditRecord={(record) => setSheet({ kind: 'record', record })}
              onAddRecord={(date) => openNewRecord(defaultTemplate, date)}
              onAddPlan={openNewPlan}
              onOpenRotation={openRotation}
              onEditPlan={openPlan}
              onStartPlan={handleStartPlan}
              onRecordPlan={handleRecordPlan}
            />
          ) : null}
          {tab === 'stats' ? (
            <Stats
              records={records}
              plans={plans}
              planHistory={planHistory}
              activePlanId={activeShift?.sourcePlanId ?? null}
              monthlyGoal={preferences.monthlyGoal}
              settlements={settlements}
              onOpenSettlement={openSettlement}
              onOpenMissed={openMissedPlans}
              initialPeriod={statsPeriod}
              onPeriodChange={setStatsPeriod}
            />
          ) : null}
          {tab === 'settings' ? (
            <Settings
              templates={templates}
              recordCount={records.length}
              monthlyGoal={preferences.monthlyGoal}
              theme={preferences.theme}
              resolvedTheme={resolvedTheme}
              lastBackupAt={preferences.lastBackupAt}
              onAddTemplate={() => openTemplate()}
              onEditTemplate={(template) => openTemplate(template)}
              onEditGoal={() => setSheet({ kind: 'goal' })}
              onThemeChange={handleThemeChange}
              reminder={{
                ...reminderStatus,
                enabled: preferences.reminderEnabled,
                leadMinutes: preferences.reminderLeadMinutes,
              }}
              onToggleReminder={handleToggleReminder}
              onReminderLeadChange={handleReminderLeadChange}
              onRequestExactAlarm={handleRequestExactAlarm}
              onExportJson={handleExportJson}
              onExportCsv={handleExportCsv}
              onImportFile={handleImportFile}
              onClearRecords={requestClearRecords}
              installAvailable={Boolean(installPrompt)}
              onInstall={handleInstall}
              isStandalone={isStandalone}
            />
          ) : null}
        </div>
      </main>

      <BottomNav
        tab={tab}
        activeTiming={Boolean(activeShift)}
        timingPaused={Boolean(activeShift?.pausedAt)}
        onChange={goToTab}
      />

      {sheet?.kind === 'record' ? (
        <RecordSheet
          key={
            sheet.record?.id ??
            sheet.plan?.id ??
            `new-${sheet.template?.id ?? 'custom'}-${sheet.date ?? todayISO()}`
          }
          templates={templates}
          record={sheet.record}
          plan={sheet.plan}
          template={sheet.template}
          initialDate={sheet.date}
          recentRecord={sheet.record || sheet.plan ? undefined : latestRecord}
          onClose={closeSheet}
          onSave={handleSaveRecord}
          onDelete={sheet.record ? handleDeleteRecord : undefined}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'plan' ? (
        <PlanSheet
          key={sheet.plan?.id ?? `new-plan-${sheet.date ?? todayISO()}`}
          templates={templates}
          plan={sheet.plan}
          initialDate={sheet.date}
          defaultTemplate={defaultTemplate}
          reminderAvailable={reminderStatus.supported}
          globalReminderEnabled={preferences.reminderEnabled}
          globalReminderLeadMinutes={preferences.reminderLeadMinutes}
          onClose={closeSheet}
          onSave={handleSavePlan}
          onDelete={sheet.plan ? requestDeletePlan : undefined}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'rotation' ? (
        <RotationSheet
          key={`rotation-${sheet.date ?? todayISO()}`}
          templates={templates}
          plans={plans}
          initialDate={sheet.date}
          onClose={closeSheet}
          onGenerate={handleGenerateRotation}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'missed' ? (
        <MissedPlansSheet
          plans={plans}
          records={records}
          activePlanId={activeShift?.sourcePlanId ?? null}
          onClose={closeSheet}
          onRecord={handleRecordPlan}
          onSkip={requestSkipPlan}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'template' ? (
        <TemplateSheet
          key={sheet.template?.id ?? 'new-template'}
          template={sheet.template}
          onClose={closeSheet}
          onSave={handleSaveTemplate}
          onDelete={sheet.template ? requestDeleteTemplate : undefined}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'goal' ? (
        <GoalSheet
          goal={preferences.monthlyGoal}
          onClose={closeSheet}
          onSave={handleSaveGoal}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'startTiming' ? (
        <StartTimingSheet
          templates={templates}
          defaultTemplate={defaultTemplate}
          onClose={closeSheet}
          onStart={handleStartTiming}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'endTiming' ? (
        <EndTimingSheet
          shift={sheet.shift}
          endTime={sheet.endTime}
          endAt={sheet.endAt}
          onClose={closeSheet}
          onSave={handleSaveTimingEnd}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {sheet?.kind === 'settlement' ? (
        <SettlementSheet
          monthLabel={sheet.context.monthLabel}
          baseEarnings={sheet.context.baseEarnings}
          baseMinutes={sheet.context.baseMinutes}
          workedDays={sheet.context.workedDays}
          settlement={sheet.settlement}
          onClose={closeSheet}
          onSave={handleSaveSettlement}
          onShare={handleSharePayslip}
          escapeDisabled={Boolean(confirm)}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={
            toast.onAction
              ? () => {
                  const action = toast.onAction;
                  setToast(null);
                  action?.();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
