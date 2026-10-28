import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { saveTextFile } from '../app/fileExport';
import type { SheetState } from '../app/sheetState';
import { hapticImpact, hapticSuccess } from '../feedback';
import { runThemeTransition } from '../motion';
import { normalizeReminderLead } from '../reminders';
import type { ReminderStatus } from '../reminderService';
import type {
  AppPreferences,
  DayPayRule,
  MonthlySettlement,
  ShiftTemplate,
  ThemePreference,
} from '../types';
import { uid } from '../utils';
import type { ConfirmState } from '../app/sheetState';

type SetPreferences = Dispatch<SetStateAction<AppPreferences>>;
type SetTemplates = Dispatch<SetStateAction<ShiftTemplate[]>>;
type SetSettlements = Dispatch<SetStateAction<MonthlySettlement[]>>;

interface SettingsActionsOptions {
  sheet: SheetState | null;
  reminderStatus: ReminderStatus;
  preferences: AppPreferences;
  setPreferences: SetPreferences;
  setTemplates: SetTemplates;
  setSettlements: SetSettlements;
  closeSheet: () => void;
  notify: (message: string) => void;
  askConfirm: (state: ConfirmState) => void;
  closeConfirm: () => void;
  requestPermission: () => Promise<ReminderStatus>;
  requestExactAlarm: () => Promise<ReminderStatus>;
}

/**
 * 设置页与导出相关的动作。
 *
 * 这些 handler 的共同点是「改偏好 / 改班次 / 导出一个文本文件」，
 * 与「当前在哪个标签、打开哪个浮层」无关。放在 App 里会让外壳越来越厚，
 * 也会让人误以为它们依赖导航状态。抽出来后 App 只负责接线。
 *
 * 返回值不带 handle 前缀，调用处按原有变量名解构，JSX 无需改动。
 */
export function useSettingsActions({
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
}: SettingsActionsOptions) {
  const saveSettlement = useCallback(
    (input: Omit<MonthlySettlement, 'monthKey' | 'updatedAt'>) => {
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

  const sharePayslip = useCallback(
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

  const shareAnnualReport = useCallback(
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

  const saveGoal = useCallback(
    (goal: number) => {
      setPreferences((prev) => ({ ...prev, monthlyGoal: goal }));
      hapticSuccess();
      closeSheet();
      notify(goal > 0 ? '月收入目标已更新' : '已清除月收入目标');
    },
    [setPreferences, closeSheet, notify],
  );

  const changeDayRule = useCallback(
    (dayRule: DayPayRule) => setPreferences((prev) => ({ ...prev, dayRule })),
    [setPreferences],
  );

  const changeTheme = useCallback(
    (theme: ThemePreference, origin?: { x: number; y: number }) => {
      runThemeTransition(() => setPreferences((prev) => ({ ...prev, theme })), origin);
    },
    [setPreferences],
  );

  const toggleReminder = useCallback(async () => {
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

  const changeReminderLead = useCallback(
    (minutes: number) => {
      setPreferences((prev) => ({
        ...prev,
        reminderLeadMinutes: normalizeReminderLead(minutes),
      }));
    },
    [setPreferences],
  );

  const requestExactAlarmAction = useCallback(async () => {
    const status = await requestExactAlarm();
    notify(
      status.exactAlarm === 'granted' ? '精确提醒已开启' : '未开启精确提醒，通知可能略有延迟',
    );
  }, [requestExactAlarm, notify]);

  const saveTemplate = useCallback(
    (input: Omit<ShiftTemplate, 'id'>) => {
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

  return {
    saveSettlement,
    sharePayslip,
    shareAnnualReport,
    saveGoal,
    changeDayRule,
    changeTheme,
    toggleReminder,
    changeReminderLead,
    requestExactAlarm: requestExactAlarmAction,
    saveTemplate,
    requestDeleteTemplate,
  };
}
