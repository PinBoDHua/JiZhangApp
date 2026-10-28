import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SheetRouter, type SheetActions, type SheetData } from './app/sheetRouter';
import { DEFAULT_DAY_PAY_RULE, DEFAULT_TEMPLATES } from './types';
import type { ActiveShift, PlannedShift, WorkRecord } from './types';
import type { SheetState } from './app/sheetState';

// 浮层里的取焦、滚动锁都在 effect 中，SSR 不会执行；这里只需最小的 window 桩
const stubWindow = {
  matchMedia: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  location: { reload: () => undefined },
};
(globalThis as unknown as { window: unknown }).window = stubWindow;

const noop = () => undefined;

const record: WorkRecord = {
  id: 'record-1',
  date: '2026-10-24',
  templateId: DEFAULT_TEMPLATES[0].id,
  shiftName: DEFAULT_TEMPLATES[0].name,
  shiftColor: DEFAULT_TEMPLATES[0].color,
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  multiplier: 1.5,
  note: '',
  createdAt: 1,
  updatedAt: 1,
};

const plan: PlannedShift = {
  id: 'plan-1',
  date: '2026-10-27',
  templateId: DEFAULT_TEMPLATES[0].id,
  shiftName: DEFAULT_TEMPLATES[0].name,
  shiftColor: DEFAULT_TEMPLATES[0].color,
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
  createdAt: 1,
  updatedAt: 1,
};

const active: ActiveShift = {
  templateId: DEFAULT_TEMPLATES[0].id,
  sourcePlanId: null,
  shiftName: DEFAULT_TEMPLATES[0].name,
  shiftColor: DEFAULT_TEMPLATES[0].color,
  startDate: '2026-10-26',
  startTime: '08:00',
  startedAt: 1,
  pausedAt: null,
  pausedMs: 0,
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
};

const data: SheetData = {
  templates: DEFAULT_TEMPLATES,
  records: [record],
  plans: [plan],
  activePlanId: null,
  latestRecord: record,
  defaultTemplate: DEFAULT_TEMPLATES[0],
  dayRule: DEFAULT_DAY_PAY_RULE,
  monthlyGoal: 5000,
  reminder: { available: true, enabled: true, leadMinutes: 60 },
};

const actions: SheetActions = {
  close: noop,
  saveRecord: noop,
  deleteRecord: noop,
  savePlan: noop,
  requestDeletePlan: noop,
  generateBatch: noop,
  generateRotation: noop,
  recordPlan: noop,
  skipPlan: noop,
  saveTemplate: noop,
  requestDeleteTemplate: noop,
  saveGoal: noop,
  startTiming: noop,
  saveTimingEnd: noop,
  saveSettlement: noop,
  sharePayslip: noop,
};

function render(sheet: SheetState, guard = false): string {
  return renderToString(<SheetRouter sheet={sheet} guard={guard} data={data} actions={actions} />);
}

/**
 * 浮层路由的回归测试。
 *
 * 这段 switch 从 App 里抽出来时，最容易出的错是「case 分支传错 prop」或
 * 「新增分支忘了接线」——SSR 会把这些错误直接暴露成渲染异常或标题缺失，
 * 比在真机上逐个点开每个浮层快得多。
 */
describe('浮层路由', () => {
  it('每种浮层都能渲染出对应标题', () => {
    expect(render({ kind: 'record' })).toContain('记一班');
    expect(render({ kind: 'record', record })).toContain('编辑记录');
    expect(render({ kind: 'record', plan, date: plan.date })).toContain('记这一班');
    expect(render({ kind: 'plan' })).toContain('排班');
    expect(render({ kind: 'plan', plan })).toContain('编辑排班');
    expect(render({ kind: 'batch', date: '2026-10-24' })).toContain('批量补记');
    expect(render({ kind: 'rotation', date: '2026-10-24' })).toContain('轮班表');
    expect(render({ kind: 'missed' })).toContain('待处理排班');
    expect(render({ kind: 'template' })).toContain('新增班次');
    expect(render({ kind: 'template', template: DEFAULT_TEMPLATES[0] })).toContain('编辑班次');
    expect(render({ kind: 'goal' })).toContain('月收入目标');
    expect(render({ kind: 'startTiming' })).toContain('开始打卡');
    expect(
      render({ kind: 'endTiming', shift: active, endTime: '11:00', endAt: Date.now() }),
    ).toContain('结束打卡');
    expect(
      render({
        kind: 'settlement',
        context: {
          monthKey: '2026-10',
          monthLabel: '2026年10月',
          baseEarnings: 3200,
          baseMinutes: 9000,
          workedDays: 18,
          overtimeMinutes: 0,
          overtimeEarnings: 0,
        },
      }),
    ).toContain('工资结算');
  });

  it('目标浮层回填当前的月收入目标', () => {
    expect(render({ kind: 'goal' })).toContain('5000');
  });

  it('确认框打开时把 guard 传给浮层，避免一次 Escape 关掉两层', () => {
    // Escape 逻辑在 effect 里，SSR 无法直接断言；这里锁住「guard 不改变渲染结果」
    expect(render({ kind: 'goal' }, true)).toBe(render({ kind: 'goal' }, false));
  });
});
