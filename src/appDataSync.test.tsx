// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useAppData } from './hooks/useAppData';
import { readRecoveryMap, STORAGE_KEYS } from './storage';
import type { WorkRecord } from './types';

const RECORDS_KEY = STORAGE_KEYS.records;

function makeRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id: 'r1',
    date: '2026-10-24',
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
    ...overrides,
  };
}

function diskRecords(): WorkRecord[] {
  const raw = localStorage.getItem(RECORDS_KEY);
  return raw ? (JSON.parse(raw) as WorkRecord[]) : [];
}

function seed(records: unknown[]): void {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe('reload 不会把过滤结果写回磁盘', () => {
  it('校验不通过的记录被保全，磁盘上的原始数据不丢', () => {
    vi.useFakeTimers();
    const good = makeRecord();
    const bad = makeRecord({ id: 'r2', date: '2026-02-30' });
    seed([good, bad]);

    const { result } = renderHook(() => useAppData());
    // 内存里只剩合法记录
    expect(result.current.records).toHaveLength(1);
    // 被丢弃的条目进了恢复副本，仍可导出
    const recovery = readRecoveryMap();
    expect(recovery[RECORDS_KEY]?.raw).toContain('2026-02-30');

    act(() => result.current.reload());
    vi.advanceTimersByTime(500);

    // 关键：磁盘仍是 2 条，坏记录没有被“读回即回写”删掉
    expect(diskRecords()).toHaveLength(2);
    expect(result.current.records).toHaveLength(1);
  });

  it('没有待写变更时不会把刚读到的数据再写一遍', () => {
    vi.useFakeTimers();
    seed([makeRecord({ note: 'base' })]);
    const { result } = renderHook(() => useAppData());

    // 模拟另一个标签页改了这一集合
    seed([makeRecord({ note: 'tabB' })]);
    const before = localStorage.getItem(RECORDS_KEY);

    act(() => result.current.reload());
    vi.advanceTimersByTime(500);

    expect(result.current.records[0].note).toBe('tabB');
    // 本页没有编辑，不该产生任何写盘
    expect(localStorage.getItem(RECORDS_KEY)).toBe(before);
  });

  it('正常编辑仍然会落盘（跳过回写没有误伤写入）', () => {
    vi.useFakeTimers();
    seed([makeRecord()]);
    const { result } = renderHook(() => useAppData());

    act(() => {
      result.current.setRecords([makeRecord({ note: 'edited' })]);
    });
    vi.advanceTimersByTime(500);

    expect(diskRecords()[0].note).toBe('edited');
  });
});

describe('reload 与另一个标签页的并发写', () => {
  it('本页有待写变更时不立即 flush，覆盖另一页刚写入的数据', () => {
    vi.useFakeTimers();
    seed([makeRecord({ note: 'base' })]);
    const { result } = renderHook(() => useAppData());

    // 本页编辑，进入 200ms 合并窗口（尚未落盘）
    act(() => {
      result.current.setRecords([makeRecord({ note: 'tabA' })]);
    });
    // 另一个标签页这时写入了自己的版本
    seed([makeRecord({ note: 'tabB' })]);
    const otherTab = localStorage.getItem(RECORDS_KEY);

    act(() => result.current.reload());

    // 过去 reload() 第一行就 flush()，这里会立刻变成 tabA 并盖掉 tabB
    expect(localStorage.getItem(RECORDS_KEY)).toBe(otherTab);
    // 本页未落盘的编辑也没有被磁盘内容覆盖
    expect(result.current.records[0].note).toBe('tabA');
  });

  it('本页无待写变更时读入另一页的数据', () => {
    vi.useFakeTimers();
    seed([makeRecord({ note: 'base' })]);
    const { result } = renderHook(() => useAppData());

    seed([makeRecord({ note: 'tabB' })]);
    act(() => result.current.reload());

    expect(result.current.records[0].note).toBe('tabB');
  });
});
