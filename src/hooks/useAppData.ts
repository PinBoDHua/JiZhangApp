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
 * 一次 reload() 从磁盘读回、即将写进 state 的值。
 *
 * 记录它们的原因有两个：
 * 1. 这些值本来就在磁盘上，再写回去没有意义；更糟的是读取层会过滤掉校验
 *    不通过的条目，一旦回写，那些条目就被永久删除了（它们的 JSON 是合法的，
 *    走不到“解析失败保全原文”那条路）。
 * 2. 跨标签页同步时，本页如果还有没落盘的编辑，不能拿磁盘上的旧内容覆盖它。
 */
type ExternalValues = Record<string, unknown>;

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
  syncTick: number,
  consumeExternal: (key: string, value: unknown) => boolean,
): void {
  const lastPersisted = useRef(value);
  useEffect(() => {
    // 本次变化来自 reload()/跨标签页读取：同步基准但不写盘
    if (consumeExternal(key, value)) {
      lastPersisted.current = value;
      return;
    }
    if (Object.is(lastPersisted.current, value)) return;
    lastPersisted.current = value;
    queue.schedule(key, () => save(value));
  }, [value, save, key, queue, syncTick, consumeExternal]);
}

/**
 * 本机数据仓库：七个集合「读取一次 → 变更后合并写盘」。
 *
 * - 首次读取走 loadLedger()，迁移与 meta 解析只做一次；
 * - 变更经写盘队列合并（默认 200ms），页面隐藏、卸载时强制落盘；
 * - reload() 供跨标签页同步使用：只替换没有待写变更的集合，
 *   且读回的值不会再次落盘。
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
  /** 本次 reload 来自磁盘的值；被对应 persist effect 消费后删除 */
  const externalRef = useRef<ExternalValues | null>(null);
  /** reload 时自增，保证即使集合值没变，persist effect 也会重新跑一次 */
  const [syncTick, setSyncTick] = useState(0);

  /** 判断这个值是否来自本次 reload，并把它标记为已消费 */
  const consumeExternal = useCallback((key: string, value: unknown): boolean => {
    const map = externalRef.current;
    if (map === null) return false;
    if (!Object.prototype.hasOwnProperty.call(map, key)) return false;
    if (!Object.is(map[key], value)) return false;
    delete map[key];
    return true;
  }, []);

  usePersistEffect(records, 'records', saveRecords, queue, syncTick, consumeExternal);
  usePersistEffect(templates, 'templates', saveTemplates, queue, syncTick, consumeExternal);
  usePersistEffect(
    preferences,
    'preferences',
    savePreferences,
    queue,
    syncTick,
    consumeExternal,
  );
  usePersistEffect(activeShift, 'activeShift', saveActiveShift, queue, syncTick, consumeExternal);
  usePersistEffect(
    settlements,
    'settlements',
    saveSettlements,
    queue,
    syncTick,
    consumeExternal,
  );
  // 排班始终按「日期 + 开始时间」落盘，读取方不必再排一次
  const saveSortedPlans = useCallback((value: PlannedShift[]) => savePlans(sortPlans(value)), []);
  usePersistEffect(plans, 'plans', saveSortedPlans, queue, syncTick, consumeExternal);
  usePersistEffect(planHistory, 'planHistory', savePlanHistory, queue, syncTick, consumeExternal);

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
    // 不再 queue.flush()：flush 会把本页尚未落盘的旧快照先写出去，
    // 反而盖掉另一个标签页刚写的新数据。
    const next = loadLedger();
    const fromDisk: ExternalValues = {};
    const apply = <T,>(key: string, diskValue: T, setValue: (value: T) => void) => {
      // 本页对该集合还有待写变更：保留本页版本，避免被磁盘上的旧内容覆盖
      if (queue.hasPending(key)) return;
      fromDisk[key] = diskValue;
      setValue(diskValue);
    };

    apply('records', next.records, setRecords);
    apply('templates', next.templates, setTemplates);
    apply('preferences', next.preferences, setPreferences);
    apply('activeShift', next.activeShift, setActiveShift);
    apply('settlements', next.settlements, setSettlements);
    apply('plans', next.plans, setPlans);
    apply('planHistory', next.planHistory, setPlanHistory);

    externalRef.current = fromDisk;
    // 集合值可能没变（例如 activeShift 两次都是 null），靠这个计数让 effect 重新执行
    setSyncTick((tick) => tick + 1);
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
