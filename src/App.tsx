import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { BottomNav } from './components/BottomNav';
import { BatchRecordSheet } from './components/BatchRecordSheet';
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
import { useAppData } from './hooks/useAppData';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useIsomorphicLayoutEffect } from './hooks/useIsomorphicLayoutEffect';
import { useReminderSync } from './hooks/useReminderSync';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { hapticImpact, hapticSuccess, hapticTap } from './feedback';
import { navDirection, prefersReducedMotion, runScreenTransition, runThemeTransition } from './motion';
import { SheetMotionContext } from './sheetMotion';
import { exportFile } from './native';
import { restorePendingPlan, toPlanHistoryEntry } from './planStats';
import { normalizeReminderLead } from './reminders';
import type { RotationShift } from './rotation';
import type { RecordDraft } from './batch';
import { buildBackup, parseBackup, STORAGE_ERROR_EVENT } from './storage';
import { parseCsvRecords } from './csv';
import { parseAppAction, type AppShortcut } from './shortcuts';
import type {
  ActiveShift,
  DayPayRule,
  MonthlySettlement,
  OvertimeRule,
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
  freePlanDates,
  rawMinutes,
  sortPlans,
  toISODate,
  todayISO,
  toCsv,
  uid,
} from './utils';

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
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
  | { kind: 'batch'; date?: string }
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

export default function App() {
  const {
    records,
    setRecords,
    templates,
    setTemplates,
    preferences,
    setPreferences,
    activeShift,
    setActiveShift,
    settlements,
    setSettlements,
    plans,
    setPlans,
    planHistory,
    setPlanHistory,
  } = useAppData();
  const { toast, dismissToast, notify, notifyWithAction } = useToast();
  const resolvedTheme = useTheme(preferences.theme);
  const { installAvailable, isStandalone, install } = useInstallPrompt();
  const [calendarFocus, setCalendarFocus] = useState<{
    date: string;
    token: number;
  } | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('month');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('records');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sheetCloseTimerRef = useRef<number | null>(null);
  const handledLaunchUrl = useRef<string | null>(null);
  const latestRecord = findLatestRecord(records);
  const latestTemplate = latestRecord?.templateId
    ? templates.find((template) => template.id === latestRecord.templateId)
    : undefined;
  const defaultTemplate = latestTemplate ?? templates[0] ?? null;
  const goToTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      hapticTap();
      runScreenTransition(() => {
        if (next !== 'calendar') setCalendarFocus(null);
        setTab(next);
      }, navDirection(tab, next));
    },
    [tab],
  );

  /** 快捷方式统一入口：PWA 的 ?action= 与 Android 的 gongshi:// 都走这里 */
  const openAppShortcut = useCallback(
    (action: AppShortcut) => {
      if (action === 'record') {
        setSheet({ kind: 'record', template: defaultTemplate, date: todayISO() });
      } else if (action === 'timing') {
        setSheet({ kind: 'startTiming' });
      } else if (action === 'batch') {
        setSheet({ kind: 'batch' });
      } else {
        setStatsPeriod('month');
        goToTab('stats');
      }
    },
    [defaultTemplate, goToTab],
  );

  useEffect(() => {
    const initial = parseAppAction(`${window.location.search}${window.location.hash}`);
    let timer: number | null = null;
    if (initial) {
      // 先清掉 query，避免依赖变化重跑时重复打开
      window.history.replaceState(null, '', window.location.pathname);
      // 延后一帧执行，等首次渲染和默认模板就绪后再打开浮层
      timer = window.setTimeout(() => openAppShortcut(initial), 0);
    }
    const clearInitial = () => {
      if (timer !== null) window.clearTimeout(timer);
    };
    if (!Capacitor.isNativePlatform()) return clearInitial;
    let disposed = false;
    let remove: (() => void) | undefined;
    // 冷启动：快捷方式通过 launch intent 进入时，App 插件不一定补发 appUrlOpen
    void CapacitorApp.getLaunchUrl()
      .then((result) => {
        if (!result?.url || handledLaunchUrl.current === result.url) return;
        handledLaunchUrl.current = result.url;
        const action = parseAppAction(result.url);
        if (action) openAppShortcut(action);
      })
      .catch(() => {
        // 没有 launch URL 时插件可能直接 reject，忽略即可
      });
    void CapacitorApp.addListener('appUrlOpen', (event) => {
      const action = parseAppAction(event.url);
      if (action) openAppShortcut(action);
    }).then((handle) => {
      remove = () => void handle.remove();
      if (disposed) remove();
    });
    return () => {
      clearInitial();
      disposed = true;
      remove?.();
    };
  }, [openAppShortcut]);

  /** 浮层统一先播 220ms 退场，再真正卸载；减少动态效果时立即关闭。 */  const closeSheet = useCallback(() => {
    if (!sheet || sheetCloseTimerRef.current !== null) return;
    if (prefersReducedMotion()) {
      setSheet(null);
      return;
    }
    const closingTarget = sheet;
    setSheetClosing(true);
    sheetCloseTimerRef.current = window.setTimeout(() => {
      sheetCloseTimerRef.current = null;
      setSheet((current) => (current === closingTarget ? null : current));
      setSheetClosing(false);
    }, 220);
  }, [sheet]);

  // 退场动画还没结束就打开了新浮层时，取消上一次的卸载，避免新浮层被误关
  useEffect(() => {
    if (!sheet || sheetCloseTimerRef.current === null) return;
    window.clearTimeout(sheetCloseTimerRef.current);
    sheetCloseTimerRef.current = null;
    setSheetClosing(false);
  }, [sheet]);

  useEffect(
    () => () => {
      if (sheetCloseTimerRef.current !== null) {
        window.clearTimeout(sheetCloseTimerRef.current);
      }
    },
    [],
  );

  const openPlanFromNotification = useCallback(
    (date: string) => {
      runScreenTransition(() => {
        setSheet(null);
        setCalendarMode('plans');
        setCalendarFocus({ date, token: Date.now() });
        setTab('calendar');
      }, navDirection(tab, 'calendar'));
    },
    [tab],
  );

  const {
    status: reminderStatus,
    requestPermission,
    requestExactAlarm,
  } = useReminderSync({
    plans,
    enabled: preferences.reminderEnabled,
    leadMinutes: preferences.reminderLeadMinutes,
    onOpenPlanDate: openPlanFromNotification,
  });

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
        closeSheet();
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
  }, [confirm, sheet, tab, goToTab, closeSheet]);

  useEffect(() => {
    document.title = activeShift
      ? activeShift.pausedAt
        ? '已暂停 · 工时账本'
        : '计时中 · 工时账本'
      : '工时账本 · 班次与收入记录';
  }, [activeShift]);

  useIsomorphicLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  useEffect(() => {
    const onStorageError = () => {
      notify('保存失败：本地存储不可用或空间已满，请先导出备份');
    };
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError);
  }, [notify]);

  const archivePlan = useCallback(
    (plan: PlannedShift, status: PlanHistoryStatus, recordId: string | null) => {
      const entry = toPlanHistoryEntry(plan, status, recordId);
      setPlans((prev) => prev.filter((item) => item.id !== plan.id));
      setPlanHistory((prev) => [
        ...prev.filter((item) => item.id !== entry.id),
        entry,
      ]);
    },
    // setter 来自 useAppData，与 useState 的 setter 一样稳定
    [setPlans, setPlanHistory],
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

  const openBatch = (date = toISODate(new Date())) => {
    setSheet({ kind: 'batch', date });
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
    hapticSuccess();
    closeSheet();
    notify('工资结算已保存');
  };

  const handleSharePayslip = async (text: string) => {
    if (!sheet || sheet.kind !== 'settlement') return;
    try {
      await exportFile(
        `工资条-${sheet.context.monthLabel}.txt`,
        text,
        'text/plain;charset=utf-8',
        '保存或分享工资条',
      );
      notify(Capacitor.isNativePlatform() ? '工资条已生成' : '工资条已导出');
    } catch (error) {
      if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
      notify('工资条导出失败，请重试');
    }
  };

  const handleShareAnnualReport = async (text: string, year: number) => {
    try {
      await exportFile(
        `工时账本-${year}年度复盘.txt`,
        text,
        'text/plain;charset=utf-8',
        '保存或分享年度复盘',
      );
      notify(Capacitor.isNativePlatform() ? '年度报告已生成' : '年度报告已导出');
    } catch (error) {
      if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
      notify('年度报告导出失败，请重试');
    }
  };

  const handleSaveGoal = (goal: number) => {
    setPreferences((prev) => ({ ...prev, monthlyGoal: goal }));
    hapticSuccess();
    closeSheet();
    notify(goal > 0 ? '月收入目标已更新' : '已清除月收入目标');
  };

  const handleDayRuleChange = (dayRule: DayPayRule) => {
    setPreferences((prev) => ({ ...prev, dayRule }));
  };

  const handleThemeChange = (theme: ThemePreference, origin?: { x: number; y: number }) => {
    runThemeTransition(() => {
      setPreferences((prev) => ({ ...prev, theme }));
    }, origin);
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
    const status = await requestPermission();
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
    const status = await requestExactAlarm();
    notify(
      status.exactAlarm === 'granted' ? '精确提醒已开启' : '未开启精确提醒，通知可能略有延迟',
    );
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
      // 单日排班允许一天多班；按周重复时跳过已有排班的日期，避免重复堆积
      const targetDates = dates.length > 1 ? freePlanDates(dates, plans) : dates;
      if (targetDates.length === 0) {
        notify('这些日期都已有排班，换个起始日期试试');
        return;
      }
      const timestamp = Date.now();
      const created = targetDates.map((date) => ({
        ...input,
        date,
        id: uid(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      setPlans((prev) => sortPlans([...prev, ...created]));
      const skipped = dates.length - targetDates.length;
      notify(
        skipped > 0
          ? `已排 ${created.length} 个班次，跳过 ${skipped} 个已有排班的日期`
          : created.length > 1
            ? `已排 ${created.length} 个班次`
            : '排班已保存',
      );
    }
    hapticSuccess();
    closeSheet();
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
        overtime: entry.template.overtime ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

    if (created.length === 0) {
      notify('所选范围没有可生成的排班');
      return;
    }

    setPlans((prev) => sortPlans([...prev, ...created]));
    hapticSuccess();
    closeSheet();
    const createdIds = new Set(created.map((plan) => plan.id));
    notifyWithAction(`已生成 ${created.length} 个排班`, '撤销', () => {
      setPlans((prev) => prev.filter((plan) => !createdIds.has(plan.id)));
    });
  };

  const handleGenerateBatch = (drafts: RecordDraft[], planIds: Record<string, string>) => {
    const timestamp = Date.now();
    const created: WorkRecord[] = drafts.map((draft) => ({
      ...draft,
      id: uid(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const recordIds = new Set(created.map((record) => record.id));
    const planSnapshot = plans;
    const historySnapshot = planHistory;
    const archived = Object.entries(planIds)
      .map(([date, planId]) => {
        const plan = plans.find((item) => item.id === planId);
        if (!plan) return null;
        const record = created.find((item) => item.date === date);
        return { plan, recordId: record?.id ?? null };
      })
      .filter((item): item is { plan: PlannedShift; recordId: string | null } => item !== null);

    setRecords((prev) => [...created, ...prev]);
    if (archived.length > 0) {
      const archivedIds = new Set(archived.map((item) => item.plan.id));
      setPlans((prev) => prev.filter((plan) => !archivedIds.has(plan.id)));
      setPlanHistory((prev) => [
        ...prev,
        ...archived.map((item) =>
          toPlanHistoryEntry(item.plan, 'completed', item.recordId),
        ),
      ]);
    }
    hapticSuccess();
    closeSheet();
    notifyWithAction(`已补记 ${created.length} 班`, '撤销', () => {
      setRecords((prev) => prev.filter((record) => !recordIds.has(record.id)));
      setPlans(planSnapshot);
      setPlanHistory(historySnapshot);
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
        hapticImpact();
        closeSheet();
        setConfirm(null);
        notify('排班已删除');
      },
    });
  };

  const handleStartPlan = (plan: PlannedShift) => {
    if (activeShift) {
      closeSheet();
      notify('已有计时进行中，先结束或放弃当前打卡');
      return;
    }
    const now = new Date();
    if (!canStartPlan(plan, now)) {
      closeSheet();
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
      overtime: plan.overtime ?? null,
    });
    hapticSuccess();
    closeSheet();
    notify(`${plan.shiftName} 打卡已开始`);
  };

  const handleRecordPlan = (plan: PlannedShift) => {
    setSheet({ kind: 'record', plan, date: plan.date });
  };

  const handleStartTiming = (template: ShiftTemplate) => {
    if (activeShift) {
      closeSheet();
      notify('已有计时进行中，先结束或放弃当前打卡');
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
      overtime: template.overtime ?? null,
    });
    hapticSuccess();
    closeSheet();
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
    overtime: OvertimeRule | null;
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
        overtime: input.overtime,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...prev,
    ]);
    if (sourcePlan) {
      archivePlan(sourcePlan, 'completed', recordId);
    }
    setActiveShift(null);
    hapticSuccess();
    closeSheet();
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
        hapticImpact();
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
    hapticSuccess();
    closeSheet();
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
    hapticSuccess();
    closeSheet();
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
        hapticImpact();
        closeSheet();
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
    hapticImpact();
    closeSheet();
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
    const backup = buildBackup({
      records,
      templates,
      preferences: {
        monthlyGoal: preferences.monthlyGoal,
        theme: preferences.theme,
        reminderEnabled: preferences.reminderEnabled,
        reminderLeadMinutes: preferences.reminderLeadMinutes,
        dayRule: preferences.dayRule,
      },
      settlements,
      plans,
      planHistory,
      appVersion: __APP_VERSION__,
    });
    try {
      await exportFile(
        `工时账本-备份-${todayISO()}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
        '保存或分享备份',
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
        '保存或分享表格',
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
          backup.preferences ? '、偏好设置' : ''
        }${settlementCount > 0 ? `、${settlementCount} 个月工资结算` : ''}${
          planCount > 0 ? `、${planCount} 个排班` : ''
        }${historyCount > 0 ? `、${historyCount} 条完成排班历史` : ''}。导入后会替换记录、结算和完成历史${
          backup.plans ? '' : '，现有排班将保留'
        }${
          !backup.planHistory && planHistory.length > 0
            ? '（备份不含完成历史，现有完成历史将清空）'
            : ''
        }，导入后可在提示条里撤销。`,
        confirmLabel: '导入',
        danger: true,
        onConfirm: () => {
          const snapshot = {
            records,
            templates,
            preferences,
            settlements,
            plans,
            planHistory,
          };
          setRecords(backup.records);
          setTemplates(backup.templates);
          if (backup.preferences) {
            const imported = backup.preferences;
            setPreferences((prev) => ({
              ...prev,
              monthlyGoal: imported.monthlyGoal ?? prev.monthlyGoal,
              theme: imported.theme ?? prev.theme,
              ...(imported.reminderEnabled !== undefined
                ? { reminderEnabled: imported.reminderEnabled }
                : {}),
              ...(imported.reminderLeadMinutes !== undefined
                ? { reminderLeadMinutes: imported.reminderLeadMinutes }
                : {}),
              ...(imported.dayRule ? { dayRule: imported.dayRule } : {}),
            }));
          }
          setSettlements(backup.settlements ?? []);
          if (backup.plans) setPlans(backup.plans);
          setPlanHistory(backup.planHistory ?? []);
          setConfirm(null);
          goToTab('home');
          notifyWithAction('备份已导入', '撤销', () => {
            setRecords(snapshot.records);
            setTemplates(snapshot.templates);
            setPreferences(snapshot.preferences);
            setSettlements(snapshot.settlements);
            setPlans(snapshot.plans);
            setPlanHistory(snapshot.planHistory);
          });
        },
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入失败，请检查文件');
    }
  };

  const handleImportCsv = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      notify('文件太大，请选择 CSV 表格');
      return;
    }
    try {
      const result = parseCsvRecords(await file.text(), {
        records,
        templates,
        dayRule: preferences.dayRule,
      });
      if (result.records.length === 0) {
        notify(
          result.invalid > 0
            ? `没有可导入的行（${result.invalid} 行格式有误）`
            : result.skipped > 0
              ? '这些记录都已经存在'
              : '表格里没有数据',
        );
        return;
      }
      const detail = [
        result.skipped > 0 ? `跳过 ${result.skipped} 条已存在` : '',
        result.invalid > 0 ? `${result.invalid} 行格式有误` : '',
        result.errors[0] ?? '',
      ]
        .filter(Boolean)
        .join('；');
      setConfirm({
        title: `导入 ${result.records.length} 条记录？`,
        message: `共读取 ${result.total} 行，将追加到现有记录，不影响已有数据${
          detail ? `。${detail}` : ''
        }。导入后可在提示条里撤销。`,
        confirmLabel: '导入',
        onConfirm: () => {
          const timestamp = Date.now();
          const created: WorkRecord[] = result.records.map((draft) => ({
            ...draft,
            id: uid(),
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
          const snapshot = records;
          setRecords((prev) => [...created, ...prev]);
          setConfirm(null);
          goToTab('home');
          notifyWithAction(`已导入 ${created.length} 条记录`, '撤销', () => {
            setRecords(snapshot);
          });
        },
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : '表格解析失败，请检查文件');
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
      message: `将删除全部 ${records.length} 条记录${historyHint}，${keepHint}。清空后可在提示条里撤销，也建议先导出备份。`,
      confirmLabel: '清空',
      danger: true,
      onConfirm: () => {
        const clearedRecords = records;
        const clearedHistory = planHistory;
        setRecords([]);
        setPlanHistory([]);
        setConfirm(null);
        notifyWithAction('记录已清空', '撤销', () => {
          setRecords(clearedRecords);
          setPlanHistory(clearedHistory);
        });
      },
    });
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
              onOpenBatch={openBatch}
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
              onExportAnnualReport={handleShareAnnualReport}
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
              dayRule={preferences.dayRule}
              onAddTemplate={() => openTemplate()}
              onEditTemplate={(template) => openTemplate(template)}
              onEditGoal={() => setSheet({ kind: 'goal' })}
              onDayRuleChange={handleDayRuleChange}
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
              onImportCsv={handleImportCsv}
              onClearRecords={requestClearRecords}
              installAvailable={installAvailable}
              onInstall={install}
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

      <SheetMotionContext.Provider value={sheetClosing}>
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
            dayRule={preferences.dayRule}
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
            dayRule={preferences.dayRule}
            reminderAvailable={reminderStatus.supported}
            globalReminderEnabled={preferences.reminderEnabled}
            globalReminderLeadMinutes={preferences.reminderLeadMinutes}
            onClose={closeSheet}
            onSave={handleSavePlan}
            onDelete={sheet.plan ? requestDeletePlan : undefined}
            escapeDisabled={Boolean(confirm)}
          />
        ) : null}

        {sheet?.kind === 'batch' ? (
          <BatchRecordSheet
            key={`batch-${sheet.date ?? todayISO()}`}
            templates={templates}
            records={records}
            plans={plans}
            defaultTemplate={defaultTemplate}
            initialDate={sheet.date}
            dayRule={preferences.dayRule}
            onClose={closeSheet}
            onGenerate={handleGenerateBatch}
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
            overtimeMinutes={sheet.context.overtimeMinutes}
            overtimeEarnings={sheet.context.overtimeEarnings}
            settlement={sheet.settlement}
            onClose={closeSheet}
            onSave={handleSaveSettlement}
            onShare={handleSharePayslip}
            escapeDisabled={Boolean(confirm)}
          />
        ) : null}
      </SheetMotionContext.Provider>

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
          leaving={toast.leaving}
          duration={toast.actionLabel ? 6000 : 2600}
          enterDelay={sheetClosing ? 220 : 0}
          onAction={
            toast.onAction
              ? () => {
                  const action = toast.onAction;
                  dismissToast();
                  action?.();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
