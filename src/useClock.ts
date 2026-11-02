import { useSyncExternalStore } from 'react';

interface ClockSnapshot {
  date: Date;
  timestamp: number;
  /** YYYY-MM-DD，单独暴露给「只要日期」的订阅者，避免每分钟跟着重渲染 */
  iso: string;
}

function isoOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function makeSnapshot(date: Date): ClockSnapshot {
  return { date, timestamp: date.getTime(), iso: isoOf(date) };
}

let snapshot: ClockSnapshot = makeSnapshot(new Date());
const listeners = new Set<() => void>();
let timer: number | undefined;

function tick(): void {
  const date = new Date();
  snapshot = makeSnapshot(date);
  listeners.forEach((listener) => listener());
}

function scheduleTick(): void {
  // 没有订阅者时不要再排下一次，避免留下一串无人清理的定时器
  if (listeners.size === 0) return;
  // 对齐到下一个整分钟，取整分钟的显示和日期切换才会准点发生
  const delay = 60_000 - (Date.now() % 60_000);
  timer = window.setTimeout(() => {
    timer = undefined;
    if (listeners.size === 0) return;
    tick();
    scheduleTick();
  }, delay);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick();
    scheduleTick();
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

/**
 * 回到前台时系统可能已经丢弃了后台的 timeout（Android WebView 常见），
 * 只补一次 tick() 会让时钟停在这一刻，必须重新排下一次。
 */
function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return;
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
  tick();
  scheduleTick();
}

function getSnapshot(): ClockSnapshot {
  return snapshot;
}

function getIso(): string {
  return snapshot.iso;
}

function getTimestamp(): number {
  return snapshot.timestamp;
}

/** 完整快照：需要同时用日期和时间的地方（例如首页计时卡） */
export function useClock(): ClockSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * 只关心「今天几号」的订阅者。
 * 跨天时 `iso` 才会变，因此同一分钟内不会触发重渲染。
 */
export function useToday(): string {
  return useSyncExternalStore(subscribe, getIso, getIso);
}

/** 只关心当前时间戳（按分钟对齐）的订阅者 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getTimestamp, getTimestamp);
}
