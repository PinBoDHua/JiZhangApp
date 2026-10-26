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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer !== undefined) window.clearInterval(timer);
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
