/**
 * 写盘队列（2.3）。
 *
 * 编辑一条记录往往会在同一帧里改动多个集合（例如导入备份会同时替换 7 个），
 * 而每次写入都要把整个集合同步序列化成 JSON 并写进 localStorage。
 * 这里把 200ms 内的变更合并成一批，同一个集合只写最后一次的值。
 *
 * 两条硬约束：
 * - **不会无限推迟**：定时器只在第一批变更进来时启动，之后连续编辑不会重置它，
 *   因此最坏情况也只是每 delay 毫秒落盘一次（相当于 maxWait）。
 * - **可强制落盘**：页面隐藏、组件卸载、跨标签页同步前都会调用 flush()，
 *   避免防抖窗口内进程被系统杀掉而丢数据。
 */

/** 合并窗口：足够把一次操作里的多次 setState 收成一次写盘，又不会让人明显感知到延迟 */
export const WRITE_DELAY_MS = 200;

export interface WriteQueue {
  /** 登记某个集合的最新写入任务；同一个 key 会被覆盖 */
  schedule(key: string, write: () => void): void;
  /** 立刻写入所有待落盘的任务 */
  flush(): void;
  /** 是否还有未落盘的变更（用于调试与测试） */
  hasPending(): boolean;
}

export function createWriteQueue(delay = WRITE_DELAY_MS): WriteQueue {
  const tasks = new Map<string, () => void>();
  let timer: number | null = null;

  const cancelTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const flush = () => {
    cancelTimer();
    if (tasks.size === 0) return;
    // 先取出再执行：写入过程中再次 schedule 的任务会进入下一批，不会被这一批吞掉
    const batch = Array.from(tasks.values());
    tasks.clear();
    batch.forEach((write) => {
      try {
        write();
      } catch {
        // 单个集合写失败不应阻断其它集合；具体错误已由 writeJson 上报
      }
    });
  };

  const schedule = (key: string, write: () => void) => {
    tasks.set(key, write);
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, delay);
  };

  return { schedule, flush, hasPending: () => tasks.size > 0 };
}

/**
 * 当前活动的写盘队列。
 * 错误边界这类拿不到 hook 的路径需要「把最新一次编辑也导出」，
 * 通过这里拿到队列并强制 flush，避免导出的是 200ms 之前的快照。
 */
let activeQueue: WriteQueue | null = null;

export function setActiveWriteQueue(queue: WriteQueue | null): void {
  activeQueue = queue;
}

export function flushActiveWrites(): void {
  activeQueue?.flush();
}
