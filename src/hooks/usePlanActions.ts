import { useCallback } from 'react';
import type { PlanActionsOptions } from './ledgerTypes';
import type {
  PlanHistoryEntry,
  PlanHistoryStatus,
  PlanInput,
  PlannedShift,
} from '../types';
import type { RotationShift } from '../rotation';
import { restorePendingPlan, toPlanHistoryEntry } from '../planStats';
import { hapticImpact, hapticSuccess } from '../feedback';
import { canStartPlan, formatDateCN, formatTimeHM, freePlanDates, sortPlans, toISODate, uid } from '../utils';

/**
 * 排班动作层：新建 / 编辑 / 删除 / 跳过 / 生成轮班 / 从排班开始打卡。
 *
 * 所有会把排班移出日历的操作都走 archivePlan，保证「排班 → 完成历史」
 * 只有一条路径，删除记录时才能按 recordId 找回对应历史并还原排班。
 */
export function usePlanActions({
  activeShift,
  plans,
  setActiveShift,
  setPlans,
  setPlanHistory,
  sheet,
  closeSheet,
  notify,
  notifyWithAction,
  askConfirm,
  closeConfirm,
}: PlanActionsOptions) {
  const archivePlan = useCallback(
    (plan: PlannedShift, status: PlanHistoryStatus, recordId: string | null) => {
      const entry = toPlanHistoryEntry(plan, status, recordId);
      setPlans((prev) => prev.filter((item) => item.id !== plan.id));
      setPlanHistory((prev) => [...prev.filter((item) => item.id !== entry.id), entry]);
    },
    [setPlans, setPlanHistory],
  );

  const savePlan = useCallback(
    (input: PlanInput, dates: string[]) => {
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
    },
    [sheet, plans, setPlans, notify, closeSheet],
  );

  const generateRotation = useCallback(
    (entries: RotationShift[]) => {
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
    },
    [plans, setPlans, notify, notifyWithAction, closeSheet],
  );

  const requestDeletePlan = useCallback(() => {
    if (!sheet || sheet.kind !== 'plan' || !sheet.plan) return;
    const target = sheet.plan;
    askConfirm({
      title: `删除「${target.shiftName}」排班？`,
      message: `${formatDateCN(target.date)} 的这一班会从日历中移除，已有记录不受影响。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        setPlans((prev) => prev.filter((plan) => plan.id !== target.id));
        closeConfirm();
        hapticImpact();
        closeSheet();
        notify('排班已删除');
      },
    });
  }, [sheet, setPlans, askConfirm, closeConfirm, closeSheet, notify]);

  const requestSkipPlan = useCallback(
    (plan: PlannedShift) => {
      askConfirm({
        title: `把「${plan.shiftName}」标记为未上？`,
        message: `${formatDateCN(plan.date)} 的这一班不会生成记录，将计入未上班次。`,
        confirmLabel: '标记未上',
        danger: true,
        onConfirm: () => {
          archivePlan(plan, 'skipped', null);
          closeConfirm();
          notify('已标记为未上');
        },
      });
    },
    [archivePlan, askConfirm, closeConfirm, notify],
  );

  const startPlan = useCallback(
    (plan: PlannedShift) => {
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
    },
    [activeShift, setActiveShift, closeSheet, notify],
  );

  /**
   * 删除记录时把已完成的排班还原成待上：排班回到日历，历史条目移除。
   * 与 archivePlan 互为逆操作，放在一起便于对照。
   */
  const restorePlan = useCallback(
    (entry: PlanHistoryEntry) => {
      const plan = restorePendingPlan(entry);
      setPlans((prev) => sortPlans([...prev.filter((item) => item.id !== plan.id), plan]));
      setPlanHistory((prev) => prev.filter((item) => item.id !== entry.id));
    },
    [setPlans, setPlanHistory],
  );

  return {
    archivePlan,
    restorePlan,
    savePlan,
    generateRotation,
    requestDeletePlan,
    requestSkipPlan,
    startPlan,
  };
}
