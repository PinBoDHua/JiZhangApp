import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveRecords, STORAGE_ERROR_EVENT, STORAGE_WRITE_OK_EVENT, isStorageFailing } from './storage';
import type { WorkRecord } from './types';

const record: WorkRecord = {
  id: 'r1',
  date: '2026-11-02',
  templateId: null,
  shiftName: '白班',
  shiftColor: '#D08A2E',
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
};

let failWrites = false;
const store = new Map<string, string>();
const events: string[] = [];

beforeEach(() => {
  failWrites = false;
  store.clear();
  events.length = 0;
  // keys.ts 只在 window 存在时派发事件
  const windowStub = new EventTarget();
  windowStub.addEventListener(STORAGE_ERROR_EVENT, () => events.push('error'));
  windowStub.addEventListener(STORAGE_WRITE_OK_EVENT, () => events.push('ok'));
  (globalThis as unknown as { window: EventTarget }).window = windowStub;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('QuotaExceededError');
      store.set(key, value);
    },
  } as Storage;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storage write failure tracking', () => {
  it('stays failed until a later write succeeds', () => {
    failWrites = true;
    saveRecords([record]);
    expect(isStorageFailing()).toBe(true);
    expect(events).toContain('error');
    expect(store.has('shift-ledger.records.v2')).toBe(false);

    failWrites = false;
    saveRecords([record]);
    expect(isStorageFailing()).toBe(false);
    expect(events).toContain('ok');
    expect(store.has('shift-ledger.records.v2')).toBe(true);
  });

  it('does not emit the recovery event when nothing was failing', () => {
    saveRecords([record]);
    expect(events).toEqual([]);
  });
});
