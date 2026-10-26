import { useSyncExternalStore } from 'react';

interface ClockSnapshot {
  date: Date;
  timestamp: number;
}

let snapshot: ClockSnapshot = {
  date: new Date(),
  timestamp: Date.now(),
};
const listeners = new Set<() => void>();
let timer: number | undefined;

function tick(): void {
  const date = new Date();
  snapshot = { date, timestamp: date.getTime() };
  listeners.forEach((listener) => listener());
}

function scheduleTick(): void {
  // 对齐到下一个整分钟，取整分钟的显示和日期切换才会准点发生
  const delay = 60_000 - (Date.now() % 60_000);
  timer = window.setTimeout(() => {
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

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') tick();
}

function getSnapshot(): ClockSnapshot {
  return snapshot;
}

export function useClock(): ClockSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
