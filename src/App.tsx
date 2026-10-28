import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { saveTextFile } from './app/fileExport';
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
import { useBackupActions } from './hooks/useBackupActions';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useIsomorphicLayoutEffect } from './hooks/useIsomorphicLayoutEffect';
import { usePlanActions } from './hooks/usePlanActions';
import { useRecordActions } from './hooks/useRecordActions';
import { useReminderSync } from './hooks/useReminderSync';
import { useSheetController, SHEET_EXIT_MS } from './hooks/useSheetController';
import { useStorageSync } from './hooks/useStorageSync';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { hapticImpact, hapticSuccess, hapticTap } from './feedback';
import { navDirection, runScreenTransition, runThemeTransition } from './motion';
import { SheetMotionContext } from './sheetMotion';
import { normalizeReminderLead } from './reminders';
import { STORAGE_ERROR_EVENT, STORAGE_ERROR_MESSAGE } from './storage';
import { parseAppAction, type AppShortcut } from './shortcuts';
import type {
  DayPayRule,
  MonthlySettlement,
  PlannedShift,
  SettlementOpenContext,
  ShiftTemplate,
  StatsPeriod,
  Tab,
  ThemePreference,
  WorkRecord,
} from './types';
import { findLatestRecord, todayISO, uid } from './utils';

/**
 * 应用外壳：只负责「当前在哪个标签、打开哪个浮层」与把动作层接到组件上。
 * 具体的数据变更在 hooks/use*Actions 里，派生计算在 overview/search 等模块里。
 */
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
    reload,
  } = useAppData();
  const { toast, dismissToast, notify, notifyWithAction } = useToast();
  const resolvedTheme = useTheme(preferences.theme);
  const { installAvailable, isStandalone, install } = useInstallPrompt();
  const { sheet, closing, openSheet, closeSheet, confirm, askConfirm, closeConfirm } =
    useSheetController();
  useStorageSync(reload);

  const [calendarFocus, setCalendarFocus] = useState<{ date: string; token: number } | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('month');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('records');
  const mainRef = useRef<HTMLElement>(null);
  const handledLaunchUrl = useRef<string | null>(null);

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
  const goHome = useCallback(() => goToTab('home'), [goToTab]);

  const latestRecord = useMemo(() => findLatestRecord(records), [records]);
  const defaultTemplate = useMemo(() => {
    if (latestRecord?.templateId) {
      const match = templates.find((template) => template.id === latestRecord.templateId);
      if (match) return match;
    }
    return templates[0] ?? null;
  }, [latestRecord, templates]);

  const planActions = usePlanActions({
    activeShift,
    plans,
    setActiveShift,
    setPlans,
    setPlanHistory,
    sheet,
    openSheet,
    closeSheet,
    notify,
    notifyWithAction,
    askConfirm,
    closeConfirm,
  });

  const recordActions = useRecordActions({
    activeShift,
    plans,
    planHistory,
    records,
    setActiveShift,
    setPlans,
    setPlanHistory,
    setRecords,
    sheet,
    openSheet,
    closeSheet,
    notify,
    notifyWithAction,
    askConfirm,
    closeConfirm,
    archivePlan: planActions.archivePlan,
    restorePlan: planActions.restorePlan,
  });

  const backupActions = useBackupActions({
    records,
    templates,
    preferences,
    activeShift,
    settlements,
    plans,
    planHistory,
    setRecords,
    setTemplates,
    setPreferences,
    setActiveShift,
    setSettlements,
    setPlans,
    setPlanHistory,
    sheet,
    openSheet,
    closeSheet,
    notify,
    notifyWithAction,
    askConfirm,
    closeConfirm,
    goHome,
  });

  /** 快捷方式统一入口：PWA 的 ?action= 与 Android 的 gongshi:// 都走这里 */
  const openAppShortcut = useCallback(
    (action: AppShortcut) => {
      if (action === 'record') {
        openSheet({ kind: 'record', template: defaultTemplate, date: todayISO() });
      } else if (action === 'timing') {
        openSheet({ kind: 'startTiming' });
      } else if (action === 'batch') {
        openSheet({ kind: 'batch' });
      } else {
        setStatsPeriod('month');
        goToTab('stats');
      }
    },
    [defaultTemplate, openSheet, goToTab],
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

  const openPlanFromNotification = useCallback(
    (date: string) => {
      runScreenTransition(() => {
        closeSheet();
        setCalendarMode('plans');
        setCalendarFocus({ date, token: Date.now() });
        setTab('calendar');
      }, navDirection(tab, 'calendar'));
    },
    [tab, closeSheet],
  );

  const { status: reminderStatus, requestPermission, requestExactAlarm } = useReminderSync({
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
        closeConfirm();
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
  }, [confirm, sheet, tab, goToTab, closeSheet, closeConfirm]);

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
    const onStorageError = () => notify(STORAGE_ERROR_MESSAGE);
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError);
  }, [notify]);

  /* ------------------------------- 打开浮层 ------------------------------- */

  const openNewRecord = useCallback(
    (template: ShiftTemplate | null, date = todayISO()) => {
      openSheet({ kind: 'record', template, date });
    },
    [openSheet],
  );
  const openRecordEditor = useCallback(
    (record: WorkRecord) => openSheet({ kind: 'record', record }),
    [openSheet],
  );
  const openNewPlan = useCallback(
    (date = todayISO()) => openSheet({ kind: 'plan', date }),
    [openSheet],
  );
  const openPlanEditor = useCallback(
    (plan: PlannedShift) => openSheet({ kind: 'plan', plan }),
    [openSheet],
  );
  const openRotation = useCallback(
    (date = todayISO()) => openSheet({ kind: 'rotation', date }),
    [openSheet],
  );
  const openBatch = useCallback(
    (date = todayISO()) => openSheet({ kind: 'batch', date }),
    [openSheet],
  );
  const openMissedPlans = useCallback(() => openSheet({ kind: 'missed' }), [openSheet]);
  const openTemplateEditor = useCallback(
    (template?: ShiftTemplate) => openSheet({ kind: 'template', template }),
    [openSheet],
  );
  const openStats = useCallback(
    (period: StatsPeriod) => {
      setStatsPeriod(period);
      goToTab('stats');
    },
    [goToTab],
  );
  const openSettlement = useCallback(
    (context: SettlementOpenContext) => {
      const settlement = settlements.find((item) => item.monthKey === context.monthKey);
      openSheet({ kind: 'settlement', context, settlement });
    },
    [settlements, openSheet],
  );

  /* ------------------------------- 设置与导出 ------------------------------ */

  const handleSaveSettlement = useCallback(
    (input: SettlementInput) => {
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
    },
    [sheet, setSettlements, closeSheet, notify],
  );

  const handleSharePayslip = useCallback(
    async (text: string) => {
      if (!sheet || sheet.kind !== 'settlement') return;
      await saveTextFile(notify, {
        filename: `工资条-${sheet.context.monthLabel}.txt`,
        content: text,
        mime: 'text/plain;charset=utf-8',
        dialogTitle: '保存或分享工资条',
        nativeSuccess: '工资条已生成',
        webSuccess: '工资条已导出',
        failure: '工资条导出失败，请重试',
      });
    },
    [sheet, notify],
  );

  const handleShareAnnualReport = useCallback(
    async (text: string, year: number) => {
      await saveTextFile(notify, {
        filename: `工时账本-${year}年度复盘.txt`,
        content: text,
        mime: 'text/plain;charset=utf-8',
        dialogTitle: '保存或分享年度复盘',
        nativeSuccess: '年度报告已生成',
        webSuccess: '年度报告已导出',
        failure: '年度报告导出失败，请重试',
      });
    },
    [notify],
  );

  const handleSaveGoal = useCallback(
    (goal: number) => {
      setPreferences((prev) => ({ ...prev, monthlyGoal: goal }));
      hapticSuccess();
      closeSheet();
      notify(goal > 0 ? '月收入目标已更新' : '已清除月收入目标');
    },
    [setPreferences, closeSheet, notify],
  );

  const handleDayRuleChange = useCallback(
    (dayRule: DayPayRule) => setPreferences((prev) => ({ ...prev, dayRule })),
    [setPreferences],
  );

  const handleThemeChange = useCallback(
    (theme: ThemePreference, origin?: { x: number; y: number }) => {
      runThemeTransition(() => setPreferences((prev) => ({ ...prev, theme })), origin);
    },
    [setPreferences],
  );

  const handleToggleReminder = useCallback(async () => {
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
  }, [reminderStatus, preferences.reminderEnabled, setPreferences, requestPermission, notify]);

  const handleReminderLeadChange = useCallback(
    (minutes: number) => {
      setPreferences((prev) => ({
        ...prev,
        reminderLeadMinutes: normalizeReminderLead(minutes),
      }));
    },
    [setPreferences],
  );

  const handleRequestExactAlarm = useCallback(async () => {
    const status = await requestExactAlarm();
    notify(
      status.exactAlarm === 'granted' ? '精确提醒已开启' : '未开启精确提醒，通知可能略有延迟',
    );
  }, [requestExactAlarm, notify]);

  const handleSaveTemplate = useCallback(
    (input: TemplateInput) => {
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
    },
    [sheet, setTemplates, closeSheet, notify],
  );

  const requestDeleteTemplate = useCallback(() => {
    if (!sheet || sheet.kind !== 'template' || !sheet.template) return;
    const target = sheet.template;
    askConfirm({
      title: `删除「${target.name}」？`,
      message: '已有记录不会受影响，之后的记账中不再出现这个班次。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        setTemplates((prev) => prev.filter((template) => template.id !== target.id));
        closeConfirm();
        hapticImpact();
        closeSheet();
        notify('班次已删除');
      },
    });
  }, [sheet, setTemplates, askConfirm, closeConfirm, closeSheet, notify]);

  const overlayOpen = Boolean(sheet || confirm);

  return (
    <div className="app-shell">
      <main className="app-main" ref={mainRef} inert={overlayOpen}>
        <div className="screen-slot" key={tab}>
          {tab === 'home' ? (
            <Home
              records={records}
              templates={templates}
              plans={plans}
              monthlyGoal={preferences.monthlyGoal}
              activeShift={activeShift}
              onAddRecord={openNewRecord}
              onEditRecord={openRecordEditor}
              onGoStats={() => openStats('month')}
              onGoWeekStats={() => openStats('week')}
              onStartTiming={() => openSheet({ kind: 'startTiming' })}
              onStartPlan={planActions.startPlan}
              onRecordPlan={(plan) => openSheet({ kind: 'record', plan, date: plan.date })}
              onEditPlan={openPlanEditor}
              onOpenMissed={openMissedPlans}
              onClockOut={recordActions.requestEndTiming}
              onPauseTiming={recordActions.pauseTiming}
              onResumeTiming={recordActions.resumeTiming}
              onAbandonTiming={recordActions.abandonTiming}
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
              onEditRecord={openRecordEditor}
              onAddRecord={(date) => openNewRecord(defaultTemplate, date)}
              onAddPlan={openNewPlan}
              onOpenBatch={openBatch}
              onOpenRotation={openRotation}
              onEditPlan={openPlanEditor}
              onStartPlan={planActions.startPlan}
              onRecordPlan={(plan) => openSheet({ kind: 'record', plan, date: plan.date })}
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
              onAddTemplate={() => openTemplateEditor()}
              onEditTemplate={openTemplateEditor}
              onEditGoal={() => openSheet({ kind: 'goal' })}
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
              onExportJson={backupActions.exportJson}
              onExportCsv={backupActions.exportCsv}
              onImportFile={backupActions.importFile}
              onImportCsv={backupActions.importCsv}
              onClearRecords={recordActions.requestClearRecords}
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
        inert={overlayOpen}
      />

      <SheetMotionContext.Provider value={closing}>
        {renderSheet()}
      </SheetMotionContext.Provider>

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={closeConfirm}
        />
      ) : null}

      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          actionLabel={toast.actionLabel}
          leaving={toast.leaving}
          duration={toast.actionLabel ? 6000 : 2600}
          enterDelay={closing ? SHEET_EXIT_MS : 0}
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

  function renderSheet() {
    if (!sheet) return null;
    const guard = Boolean(confirm);
    switch (sheet.kind) {
      case 'record':
        return (
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
            onSave={recordActions.saveRecord}
            onDelete={sheet.record ? recordActions.deleteRecord : undefined}
            escapeDisabled={guard}
          />
        );
      case 'plan':
        return (
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
            onSave={planActions.savePlan}
            onDelete={sheet.plan ? planActions.requestDeletePlan : undefined}
            escapeDisabled={guard}
          />
        );
      case 'batch':
        return (
          <BatchRecordSheet
            key={`batch-${sheet.date ?? todayISO()}`}
            templates={templates}
            records={records}
            plans={plans}
            defaultTemplate={defaultTemplate}
            initialDate={sheet.date}
            dayRule={preferences.dayRule}
            onClose={closeSheet}
            onGenerate={recordActions.generateBatch}
            escapeDisabled={guard}
          />
        );
      case 'rotation':
        return (
          <RotationSheet
            key={`rotation-${sheet.date ?? todayISO()}`}
            templates={templates}
            plans={plans}
            initialDate={sheet.date}
            onClose={closeSheet}
            onGenerate={planActions.generateRotation}
            escapeDisabled={guard}
          />
        );
      case 'missed':
        return (
          <MissedPlansSheet
            plans={plans}
            records={records}
            activePlanId={activeShift?.sourcePlanId ?? null}
            onClose={closeSheet}
            onRecord={(plan) => openSheet({ kind: 'record', plan, date: plan.date })}
            onSkip={planActions.requestSkipPlan}
            escapeDisabled={guard}
          />
        );
      case 'template':
        return (
          <TemplateSheet
            key={sheet.template?.id ?? 'new-template'}
            template={sheet.template}
            onClose={closeSheet}
            onSave={handleSaveTemplate}
            onDelete={sheet.template ? requestDeleteTemplate : undefined}
            escapeDisabled={guard}
          />
        );
      case 'goal':
        return (
          <GoalSheet
            goal={preferences.monthlyGoal}
            onClose={closeSheet}
            onSave={handleSaveGoal}
            escapeDisabled={guard}
          />
        );
      case 'startTiming':
        return (
          <StartTimingSheet
            templates={templates}
            defaultTemplate={defaultTemplate}
            onClose={closeSheet}
            onStart={recordActions.startTiming}
            escapeDisabled={guard}
          />
        );
      case 'endTiming':
        return (
          <EndTimingSheet
            shift={sheet.shift}
            endTime={sheet.endTime}
            endAt={sheet.endAt}
            onClose={closeSheet}
            onSave={recordActions.saveTimingEnd}
            escapeDisabled={guard}
          />
        );
      case 'settlement':
        return (
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
            escapeDisabled={guard}
          />
        );
      default:
        return null;
    }
  }
}
