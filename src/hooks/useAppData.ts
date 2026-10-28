import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createWriteQueue,
  loadLedger,
  setActiveWriteQueue,
  saveActiveShift,
  savePlanHistory,
  savePlans,
  savePreferences,
  saveRecords,
  saveSettlements,
  saveTemplates,
  type WriteQueue,
} from '../storage';
import type {
  ActiveShift,
  AppPreferences,
  MonthlySettlement,
  PlanHistoryEntry,
  PlannedShift,
  ShiftTemplate,
  WorkRecord,
} from '../types';
import { sortPlans } from '../utils';

/**
 * 只在值真正变化后登记写盘。
 *
 * 用「上次落盘的引用」而不是「是否首次挂载」做判断：
 * - 首次挂载时数据刚读出来，引用相同 → 不写。既省掉一次序列化，
 *   也避免把「解析失败回退成空数组」的结果覆盖回存储，坏数据还能救；
 * - StrictMode 下 effect 会挂载-卸载-再挂载，ref 保留，同样不会误写；
 * - 状态被设成同一个引用（无实际变化）时也不会写。
 *
 * 真正的写入交给写盘队列合并，避免一次操作里多个集合各写一遍。
 */
function usePersistEffect<T>(
  value: T,
  key: string,
  save: (value: T) => void,
  queue: WriteQueue,
): void {
  const lastPersisted = useRef(value);
  useEffect(() => {
    if (Object.is(lastPersisted.current, value)) return;
    lastPersisted.current = value;
    queue.schedule(key, () => save(value));
  }, [value, save, key, queue]);
}

/**
 * 本机数据仓库：七个集合「读取一次 → 变更后合并写盘」。
 *
 * - 首次读取走 loadLedger()，迁移与 meta 解析只做一次；
 * - 变更经写盘队列合并（默认 200ms），页面隐藏、卸载、跨标签页同步前强制落盘；
 * - reload() 供跨标签页同步使用，从磁盘重新读入全部集合并替换内存状态。
 */
export function useAppData() {
  const [queue] = useState(createWriteQueue);
  const [initial] = useState(loadLedger);
  const [records, setRecords] = useState<WorkRecord[]>(initial.records);
  const [templates, setTemplates] = useState<ShiftTemplate[]>(initial.templates);
  const [preferences, setPreferences] = useState<AppPreferences>(initial.preferences);
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(initial.activeShift);
  const [settlements, setSettlements] = useState<MonthlySettlement[]>(initial.settlements);
  const [plans, setPlans] = useState<PlannedShift[]>(initial.plans);
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>(initial.planHistory);

  usePersistEffect(records, 'records', saveRecords, queue);
  usePersistEffect(templates, 'templates', saveTemplates, queue);
  usePersistEffect(preferences, 'preferences', savePreferences, queue);
  usePersistEffect(activeShift, 'activeShift', saveActiveShift, queue);
  usePersistEffect(settlements, 'settlements', saveSettlements, queue);
  // 排班始终按「日期 + 开始时间」落盘，读取方不必再排一次
  const saveSortedPlans = useCallback((value: PlannedShift[]) => savePlans(sortPlans(value)), []);
  usePersistEffect(plans, 'plans', saveSortedPlans, queue);
  usePersistEffect(planHistory, 'planHistory', savePlanHistory, queue);

  // 供错误边界等拿不到 hook 的路径强制落盘
  useEffect(() => {
    setActiveWriteQueue(queue);
    return () => setActiveWriteQueue(null);
  }, [queue]);

  // 这个 effect 必须放在所有持久化 effect 之后：卸载时清理函数按定义顺序执行，
  // 保证最后一次 flush 发生在其它清理之后，不会漏掉待写数据。
  useEffect(() => {
    const flush = () => queue.flush();
    const onVisibilityChange = () => {
      // 手机端切到后台后可能被系统回收，隐藏时先落盘
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [queue]);

  const reload = useCallback(() => {
    // 先把本机尚未落盘的修改写掉：否则读回的旧数据会覆盖刚做的编辑
    queue.flush();
    const next = loadLedger();
    setRecords(next.records);
    setTemplates(next.templates);
    setPreferences(next.preferences);
    setActiveShift(next.activeShift);
    setSettlements(next.settlements);
    setPlans(next.plans);
    setPlanHistory(next.planHistory);
  }, [queue]);

  return {
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
  };
}
