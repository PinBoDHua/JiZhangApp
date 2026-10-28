import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SheetRouter } from './app/sheetRouter';
import { TAB_LABELS } from './app/tabs';
import { BottomNav } from './components/BottomNav';
import { Calendar, type CalendarMode } from './components/Calendar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Home } from './components/Home';
import { ScreenBoundary } from './components/ScreenBoundary';
import { Settings } from './components/Settings';
import { Stats } from './components/Stats';
import { Toast } from './components/Toast';
import { useAppBackButton, useAppShortcuts } from './hooks/useAppNavigation';
import { useAppData } from './hooks/useAppData';
import { useBackupActions } from './hooks/useBackupActions';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useIsomorphicLayoutEffect } from './hooks/useIsomorphicLayoutEffect';
import { usePlanActions } from './hooks/usePlanActions';
import { useRecordActions } from './hooks/useRecordActions';
import { useReminderSync } from './hooks/useReminderSync';
import { useSettingsActions } from './hooks/useSettingsActions';
import { useSheetController, SHEET_EXIT_MS } from './hooks/useSheetController';
import { useStorageSync } from './hooks/useStorageSync';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { hapticTap } from './feedback';
import { navDirection, runScreenTransition } from './motion';
import { SheetMotionContext } from './sheetMotion';
import {
  STORAGE_ERROR_EVENT,
  STORAGE_ERROR_MESSAGE,
  STORAGE_RECOVERY_EVENT,
  clearRecovery,
  readRecoveryMap,
} from './storage';
import type { AppShortcut } from './shortcuts';
import type {
  PlannedShift,
  SettlementOpenContext,
  ShiftTemplate,
  StatsPeriod,
  Tab,
  WorkRecord,
} from './types';
import { downloadFile, findLatestRecord, todayISO } from './utils';

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

  /** 快捷方式：PWA 的 ?action= 与 Android 的 gongshi:// 共用同一个入口 */
  useAppShortcuts(openAppShortcut);

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

  /** Android 返回键：确认框 → 浮层 → 回到首页 → 退出 */
  useAppBackButton({
    confirmOpen: Boolean(confirm),
    sheetOpen: Boolean(sheet),
    tab,
    onCloseConfirm: closeConfirm,
    onCloseSheet: closeSheet,
    onGoHome: goHome,
  });

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

  /**
   * 本地数据损坏时的兜底出口：读取阶段已把原文另存到恢复副本，
   * 这里给用户一个「导出副本」的入口，避免只能看到空列表却无从挽救。
   */
  useEffect(() => {
    const exportRecovery = () => {
      const map = readRecoveryMap();
      if (Object.keys(map).length === 0) return;
      downloadFile(
        `工时账本-损坏数据-${todayISO()}.json`,
        JSON.stringify(map, null, 2),
        'application/json',
      );
      clearRecovery();
      notify('损坏数据的副本已导出');
    };
    const onRecovery = () =>
      notifyWithAction('本地数据读取失败，原始内容已保留', '导出副本', exportRecovery);
    // 首次读取发生在 effect 之前，补一次检查；跨会话没导出时会继续提醒
    if (Object.keys(readRecoveryMap()).length > 0) onRecovery();
    window.addEventListener(STORAGE_RECOVERY_EVENT, onRecovery);
    return () => window.removeEventListener(STORAGE_RECOVERY_EVENT, onRecovery);
  }, [notify, notifyWithAction]);

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

  const {
    saveSettlement: handleSaveSettlement,
    sharePayslip: handleSharePayslip,
    shareAnnualReport: handleShareAnnualReport,
    saveGoal: handleSaveGoal,
    changeDayRule: handleDayRuleChange,
    changeTheme: handleThemeChange,
    toggleReminder: handleToggleReminder,
    changeReminderLead: handleReminderLeadChange,
    requestExactAlarm: handleRequestExactAlarm,
    saveTemplate: handleSaveTemplate,
    requestDeleteTemplate,
  } = useSettingsActions({
    sheet,
    reminderStatus,
    preferences,
    setPreferences,
    setTemplates,
    setSettlements,
    closeSheet,
    notify,
    askConfirm,
    closeConfirm,
    requestPermission,
    requestExactAlarm,
  });

  const overlayOpen = Boolean(sheet || confirm);

  return (
    <div className="app-shell">
      <main className="app-main" ref={mainRef} inert={overlayOpen}>
        <div className="screen-slot" key={tab}>
          {/* 每页一层错误边界：单页渲染失败时仍可用底栏切走，不必整页刷新 */}
          <ScreenBoundary screen={TAB_LABELS[tab]}>
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
          </ScreenBoundary>
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
        {sheet ? (
          <SheetRouter
            sheet={sheet}
            guard={Boolean(confirm)}
            data={{
              templates,
              records,
              plans,
              activePlanId: activeShift?.sourcePlanId ?? null,
              latestRecord,
              defaultTemplate,
              dayRule: preferences.dayRule,
              monthlyGoal: preferences.monthlyGoal,
              reminder: {
                available: reminderStatus.supported,
                enabled: preferences.reminderEnabled,
                leadMinutes: preferences.reminderLeadMinutes,
              },
            }}
            actions={{
              close: closeSheet,
              saveRecord: recordActions.saveRecord,
              deleteRecord: recordActions.deleteRecord,
              savePlan: planActions.savePlan,
              requestDeletePlan: planActions.requestDeletePlan,
              generateBatch: recordActions.generateBatch,
              generateRotation: planActions.generateRotation,
              recordPlan: (plan) => openSheet({ kind: 'record', plan, date: plan.date }),
              skipPlan: planActions.requestSkipPlan,
              saveTemplate: handleSaveTemplate,
              requestDeleteTemplate,
              saveGoal: handleSaveGoal,
              startTiming: recordActions.startTiming,
              saveTimingEnd: recordActions.saveTimingEnd,
              saveSettlement: handleSaveSettlement,
              sharePayslip: handleSharePayslip,
            }}
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
}
