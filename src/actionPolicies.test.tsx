// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRecordActions } from './hooks/useRecordActions';
import { usePlanActions } from './hooks/usePlanActions';
import { DEFAULT_DAY_PAY_RULE, DEFAULT_TEMPLATES, type ActiveShift } from './types';
import type { PlannedShift } from './types';

const weekendRule = { ...DEFAULT_DAY_PAY_RULE, enabled: true, weekendMultiplier: 2 };

/** 2026-11-07 是周六，2026-11-09 是周一 */
const saturday = new Date(2026, 10, 7, 10, 0, 0);
const monday = new Date(2026, 10, 9, 10, 0, 0);

function recordActionsProps(overrides: Record<string, unknown> = {}) {
  return {
    activeShift: null,
    plans: [],
    planHistory: [],
    records: [],
    setActiveShift: vi.fn(),
    setPlans: vi.fn(),
    setPlanHistory: vi.fn(),
    setRecords: vi.fn(),
    sheet: null,
    openSheet: vi.fn(),
    closeSheet: vi.fn(),
    notify: vi.fn(),
    notifyWithAction: vi.fn(),
    askConfirm: vi.fn(),
    closeConfirm: vi.fn(),
    archivePlan: vi.fn(),
    restorePlan: vi.fn(),
    dayRule: weekendRule,
    ...overrides,
  };
}

function planActionsProps(overrides: Record<string, unknown> = {}) {
  return {
    activeShift: null,
    plans: [],
    setActiveShift: vi.fn(),
    setPlans: vi.fn(),
    setPlanHistory: vi.fn(),
    sheet: null,
    openSheet: vi.fn(),
    closeSheet: vi.fn(),
    notify: vi.fn(),
    notifyWithAction: vi.fn(),
    askConfirm: vi.fn(),
    closeConfirm: vi.fn(),
    dayRule: weekendRule,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('打卡与轮班表遵守日期倍率规则', () => {
  it('周六开始打卡时按周末倍数写入 activeShift', () => {
    vi.setSystemTime(saturday);
    const props = recordActionsProps();
    const { result } = renderHook(() => useRecordActions(props));

    result.current.startTiming(DEFAULT_TEMPLATES[0]);

    expect(props.setActiveShift).toHaveBeenCalledTimes(1);
    const shift = props.setActiveShift.mock.calls[0][0] as ActiveShift;
    expect(shift.startDate).toBe('2026-11-07');
    expect(shift.multiplier).toBe(2);
  });

  it('工作日仍按 1×，未开启规则时也保持 1×', () => {
    vi.setSystemTime(monday);
    const props = recordActionsProps();
    const { result } = renderHook(() => useRecordActions(props));
    result.current.startTiming(DEFAULT_TEMPLATES[0]);
    expect((props.setActiveShift.mock.calls[0][0] as ActiveShift).multiplier).toBe(1);

    const offProps = recordActionsProps({
      dayRule: { ...weekendRule, enabled: false },
    });
    const { result: offResult } = renderHook(() => useRecordActions(offProps));
    vi.setSystemTime(saturday);
    offResult.current.startTiming(DEFAULT_TEMPLATES[0]);
    expect((offProps.setActiveShift.mock.calls[0][0] as ActiveShift).multiplier).toBe(1);
  });

  it('轮班表逐日取倍数：周末 2×、工作日 1×', () => {
    vi.setSystemTime(monday);
    const props = planActionsProps();
    const { result } = renderHook(() => usePlanActions(props));

    result.current.generateRotation([
      { date: '2026-11-07', template: DEFAULT_TEMPLATES[0] },
      { date: '2026-11-09', template: DEFAULT_TEMPLATES[0] },
    ]);

    // setPlans 收到的是 (prev) => next，调用一次拿到结果
    const updater = props.setPlans.mock.calls[0][0] as (prev: PlannedShift[]) => PlannedShift[];
    const created = updater([]);
    const byDate = new Map(created.map((plan) => [plan.date, plan.multiplier]));
    expect(byDate.get('2026-11-07')).toBe(2);
    expect(byDate.get('2026-11-09')).toBe(1);
  });
});

describe('打开结束打卡面板不会自动暂停计时', () => {
  it('保留原本的运行状态，只冻结结束时刻', () => {
    vi.setSystemTime(saturday);
    const startedAt = saturday.getTime() - 2 * 60 * 60 * 1000;
    const activeShift: ActiveShift = {
      templateId: null,
      sourcePlanId: null,
      shiftName: '白班',
      shiftColor: '#D08A2E',
      startDate: '2026-11-07',
      startTime: '08:00',
      startedAt,
      pausedAt: null,
      pausedMs: 0,
      breakMinutes: 60,
      rate: 20,
      multiplier: 2,
      note: '',
      overtime: null,
    };
    const props = recordActionsProps({ activeShift });
    const { result } = renderHook(() => useRecordActions(props));

    result.current.requestEndTiming();

    // 不再写回 pausedAt：关闭面板后计时应当继续走，否则暂停时长会被当成休息扣掉
    expect(props.setActiveShift).not.toHaveBeenCalled();
    const opened = props.openSheet.mock.calls[0][0] as {
      kind: string;
      shift: ActiveShift;
      endTime: string;
    };
    expect(opened.kind).toBe('endTiming');
    expect(opened.shift.pausedAt).toBeNull();
    expect(opened.endTime).toBe('10:00');
  });

  it('原本手动暂停的计时保持暂停状态', () => {
    vi.setSystemTime(saturday);
    const activeShift: ActiveShift = {
      templateId: null,
      sourcePlanId: null,
      shiftName: '白班',
      shiftColor: '#D08A2E',
      startDate: '2026-11-07',
      startTime: '08:00',
      startedAt: saturday.getTime() - 2 * 60 * 60 * 1000,
      pausedAt: saturday.getTime() - 30 * 60 * 1000,
      pausedMs: 0,
      breakMinutes: 60,
      rate: 20,
      multiplier: 1,
      note: '',
      overtime: null,
    };
    const props = recordActionsProps({ activeShift });
    const { result } = renderHook(() => useRecordActions(props));

    result.current.requestEndTiming();

    const opened = props.openSheet.mock.calls[0][0] as { shift: ActiveShift };
    expect(opened.shift.pausedAt).toBe(activeShift.pausedAt);
    expect(props.setActiveShift).not.toHaveBeenCalled();
  });
});
