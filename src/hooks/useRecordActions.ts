import { useCallback } from 'react';
import type { RecordActionsOptions } from './ledgerTypes';
import type {
  ActiveShift,
  OvertimeRule,
  PlannedShift,
  RecordInput,
  ShiftTemplate,
  WorkRecord,
} from '../types';
import type { RecordDraft } from '../batch';
import { hapticImpact, hapticSuccess } from '../feedback';
import { formatTimeHM, rawMinutes, toISODate, uid } from '../utils';
import { toPlanHistoryEntry } from '../planStats';

interface TimingEndInput {
  breakMinutes: number;
  multiplier: number;
  note: string;
  overtime: OvertimeRule | null;
}

/** 一次打卡最多允许 24 小时，超出说明用户忘了结束，交给手动补记 */
const MAX_TIMING_MS = 24 * 60 * 60 * 1000;

/**
 * 记录与打卡动作层：
 * 新增 / 编辑 / 删除记录、批量补记、清空记录，以及打卡计时全流程。
 * 记录保存后如果来自排班，会通过 archivePlan 把排班标记完成。
 */
export function useRecordActions({
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
  archivePlan,
  restorePlan,
}: RecordActionsOptions) {
  const saveRecord = useCallback(
    (input: RecordInput) => {
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
        if (sourcePlan) archivePlan(sourcePlan, 'completed', recordId);
        notify(sourcePlan ? '排班已完成，记录已保存' : '已记下一班');
      }
      hapticSuccess();
      closeSheet();
    },
    [sheet, setRecords, archivePlan, notify, closeSheet],
  );

  const generateBatch = useCallback(
    (drafts: RecordDraft[], planIds: Record<string, string>) => {
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
          // 与单条保存走同一个构造函数，保证历史结构一致
          ...archived.map((item) =>
            toPlanHistoryEntry(item.plan, 'completed', item.recordId, timestamp),
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
    },
    [plans, planHistory, setRecords, setPlans, setPlanHistory, closeSheet, notifyWithAction],
  );

  const deleteRecord = useCallback(() => {
    if (!sheet || sheet.kind !== 'record' || !sheet.record) return;
    const target = sheet.record;
    const linkedHistory = planHistory.find((entry) => entry.recordId === target.id);
    setRecords((prev) => prev.filter((record) => record.id !== target.id));
    if (linkedHistory) restorePlan(linkedHistory);
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
  }, [
    sheet,
    planHistory,
    setRecords,
    restorePlan,
    setPlans,
    setPlanHistory,
    closeSheet,
    notifyWithAction,
  ]);

  const requestClearRecords = useCallback(() => {
    if (records.length === 0) return;
    const keepHint =
      plans.length > 0 ? `班次设置和 ${plans.length} 个排班计划会保留` : '班次设置会保留';
    const historyHint = planHistory.length > 0 ? `和 ${planHistory.length} 条完成排班历史` : '';
    askConfirm({
      title: '清空所有记录？',
      message: `将删除全部 ${records.length} 条记录${historyHint}，${keepHint}。清空后可在提示条里撤销，也建议先导出备份。`,
      confirmLabel: '清空',
      danger: true,
      onConfirm: () => {
        const clearedRecords = records;
        const clearedHistory = planHistory;
        setRecords([]);
        setPlanHistory([]);
        closeConfirm();
        notifyWithAction('记录已清空', '撤销', () => {
          setRecords(clearedRecords);
          setPlanHistory(clearedHistory);
        });
      },
    });
  }, [
    records,
    plans,
    planHistory,
    askConfirm,
    closeConfirm,
    setRecords,
    setPlanHistory,
    notifyWithAction,
  ]);

  const startTiming = useCallback(
    (template: ShiftTemplate) => {
      if (activeShift) {
        closeSheet();
        notify('已有计时进行中，先结束或放弃当前打卡');
        return;
      }
      const now = new Date();
      const shift: ActiveShift = {
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
      };
      setActiveShift(shift);
      hapticSuccess();
      closeSheet();
      notify('打卡已开始');
    },
    [activeShift, setActiveShift, closeSheet, notify],
  );

  const pauseTiming = useCallback(() => {
    if (!activeShift || activeShift.pausedAt) return;
    setActiveShift({ ...activeShift, pausedAt: Date.now() });
    notify('已开始休息');
  }, [activeShift, setActiveShift, notify]);

  const resumeTiming = useCallback(() => {
    if (!activeShift?.pausedAt) return;
    const now = Date.now();
    setActiveShift({
      ...activeShift,
      pausedAt: null,
      pausedMs: activeShift.pausedMs + Math.max(0, now - activeShift.pausedAt),
    });
    notify('继续计时');
  }, [activeShift, setActiveShift, notify]);

  const requestEndTiming = useCallback(() => {
    if (!activeShift) return;
    const now = new Date();
    const elapsedMs = now.getTime() - activeShift.startedAt;
    if (elapsedMs < 60_000) {
      notify('计时还不到 1 分钟，稍后再结束');
      return;
    }
    if (elapsedMs >= MAX_TIMING_MS) {
      notify('计时超过 24 小时，请手动核对后再记录');
      return;
    }
    const endTime = formatTimeHM(now);
    if (rawMinutes(activeShift.startTime, endTime) <= 0) {
      notify('计时太短，稍后再结束');
      return;
    }
    // 打开结算面板时先把计时冻结，避免面板停留期间金额继续变化；
    // 关闭面板后保持暂停，用户可以继续或再结算（面板内已有说明）。
    const pausedShift = activeShift.pausedAt
      ? activeShift
      : { ...activeShift, pausedAt: now.getTime() };
    if (!activeShift.pausedAt) setActiveShift(pausedShift);
    openSheet({ kind: 'endTiming', shift: pausedShift, endTime, endAt: now.getTime() });
  }, [activeShift, setActiveShift, openSheet, notify]);

  const saveTimingEnd = useCallback(
    (input: TimingEndInput) => {
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
      if (sourcePlan) archivePlan(sourcePlan, 'completed', recordId);
      setActiveShift(null);
      hapticSuccess();
      closeSheet();
      notify(sourcePlan ? '已结束打卡，排班已完成' : '已结束打卡，记录已保存');
    },
    [sheet, plans, setRecords, archivePlan, setActiveShift, closeSheet, notify],
  );

  const abandonTiming = useCallback(() => {
    if (!activeShift) return;
    const target = activeShift;
    askConfirm({
      title: '放弃这次打卡？',
      message: `${target.shiftName} · ${target.startTime} 开始的计时将被清除，不会生成记录。`,
      confirmLabel: '放弃',
      danger: true,
      onConfirm: () => {
        setActiveShift(null);
        closeConfirm();
        hapticImpact();
        notify('已放弃这次计时');
      },
    });
  }, [activeShift, askConfirm, closeConfirm, setActiveShift, notify]);

  return {
    saveRecord,
    generateBatch,
    deleteRecord,
    requestClearRecords,
    startTiming,
    pauseTiming,
    resumeTiming,
    requestEndTiming,
    saveTimingEnd,
    abandonTiming,
  };
}
