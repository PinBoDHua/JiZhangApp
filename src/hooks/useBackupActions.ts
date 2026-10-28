import { useCallback } from 'react';
import type { BackupActionsOptions } from './ledgerTypes';
import type { BackupData, WorkRecord } from '../types';
import {
  MAX_BACKUP_BYTES,
  backupFileError,
  buildBackup,
  parseBackup,
  summarizeBackup,
} from '../storage';
import { saveTextFile } from '../app/fileExport';
import { parseCsvRecords } from '../csv';
import { toCsv, todayISO, uid } from '../utils';

/**
 * 数据搬运动作层：导出 / 导入 备份与表格。
 *
 * 约定：
 * - 导出一律走 saveTextFile，取消分享不提示错误、也不更新「上次备份时间」；
 * - 覆盖式导入（JSON）与追加式导入（CSV）都先生成确认摘要，确认后仍可一键撤销。
 */
export function useBackupActions({
  records,
  templates,
  preferences,
  settlements,
  plans,
  planHistory,
  setRecords,
  setTemplates,
  setPreferences,
  setSettlements,
  setPlans,
  setPlanHistory,
  notify,
  notifyWithAction,
  askConfirm,
  closeConfirm,
  goHome,
}: BackupActionsOptions) {
  const exportJson = useCallback(async () => {
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
    const ok = await saveTextFile(notify, {
      filename: `工时账本-备份-${todayISO()}.json`,
      content: JSON.stringify(backup, null, 2),
      mime: 'application/json',
      dialogTitle: '保存或分享备份',
      nativeSuccess: '备份已生成',
      webSuccess: '备份已导出',
      failure: '导出失败，请重试',
    });
    // 用户取消分享时不算备份成功，避免「上次备份时间」被误更新
    if (ok) setPreferences((prev) => ({ ...prev, lastBackupAt: Date.now() }));
  }, [
    records,
    templates,
    preferences,
    settlements,
    plans,
    planHistory,
    setPreferences,
    notify,
  ]);

  const exportCsv = useCallback(async () => {
    await saveTextFile(notify, {
      filename: `工时账本-${todayISO()}.csv`,
      content: `\uFEFF${toCsv(records)}`,
      mime: 'text/csv;charset=utf-8',
      dialogTitle: '保存或分享表格',
      nativeSuccess: '表格已生成',
      webSuccess: '表格已导出',
      failure: '导出失败，请重试',
    });
  }, [records, notify]);

  const importFile = useCallback(
    async (file: File) => {
      const sizeError = backupFileError(file.size);
      if (sizeError) {
        notify(sizeError);
        return;
      }
      let backup: BackupData;
      try {
        backup = parseBackup(await file.text());
      } catch (error) {
        notify(error instanceof Error ? error.message : '导入失败，请检查文件');
        return;
      }
      const summary = summarizeBackup(backup);
      const keepPlans = backup.plans ? '' : '，现有排班将保留';
      const clearHistory =
        !backup.planHistory && planHistory.length > 0
          ? `（备份不含完成历史，现有 ${planHistory.length} 条完成历史将清空）`
          : '';
      askConfirm({
        title: '导入并覆盖当前数据？',
        message:
          `备份包含 ${summary.records} 条记录、${summary.templates} 种班次` +
          `${summary.hasPreferences ? '、偏好设置' : ''}` +
          `${summary.settlements > 0 ? `、${summary.settlements} 个月工资结算` : ''}` +
          `${summary.plans > 0 ? `、${summary.plans} 个排班` : ''}` +
          `${summary.planHistory > 0 ? `、${summary.planHistory} 条完成排班历史` : ''}` +
          `。导入后会替换记录、结算和完成历史${keepPlans}${clearHistory}，导入后可在提示条里撤销。`,
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
          closeConfirm();
          goHome();
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
    },
    [
      planHistory,
      records,
      templates,
      preferences,
      settlements,
      plans,
      setRecords,
      setTemplates,
      setPreferences,
      setSettlements,
      setPlans,
      setPlanHistory,
      askConfirm,
      closeConfirm,
      goHome,
      notify,
      notifyWithAction,
    ],
  );

  const importCsv = useCallback(
    async (file: File) => {
      if (file.size > MAX_BACKUP_BYTES) {
        notify('文件太大，请选择 CSV 表格');
        return;
      }
      let result;
      try {
        result = parseCsvRecords(await file.text(), {
          records,
          templates,
          dayRule: preferences.dayRule,
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : '表格解析失败，请检查文件');
        return;
      }
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
      const drafts = result.records;
      askConfirm({
        title: `导入 ${drafts.length} 条记录？`,
        message: `共读取 ${result.total} 行，将追加到现有记录，不影响已有数据${
          detail ? `。${detail}` : ''
        }。导入后可在提示条里撤销。`,
        confirmLabel: '导入',
        onConfirm: () => {
          const timestamp = Date.now();
          const created: WorkRecord[] = drafts.map((draft) => ({
            ...draft,
            id: uid(),
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
          const snapshot = records;
          setRecords((prev) => [...created, ...prev]);
          closeConfirm();
          goHome();
          notifyWithAction(`已导入 ${created.length} 条记录`, '撤销', () => {
            setRecords(snapshot);
          });
        },
      });
    },
    [
      records,
      templates,
      preferences,
      setRecords,
      askConfirm,
      closeConfirm,
      goHome,
      notify,
      notifyWithAction,
    ],
  );

  return { exportJson, exportCsv, importFile, importCsv };
}
