import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DEFAULT_DAY_PAY_RULE } from './types';
import type { ActiveShift, PlanHistoryEntry, PlannedShift, WorkRecord } from './types';
import type { MonthForecast } from './forecast';

// 这些组件只依赖 window.matchMedia / 定时器，渲染一次即可验证不会崩溃
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

const { default: App } = await import('./App');
const { RecordSheet } = await import('./components/RecordSheet');
const { PlanSheet } = await import('./components/PlanSheet');
const { TemplateSheet } = await import('./components/TemplateSheet');
const { SettlementSheet } = await import('./components/SettlementSheet');
const { EndTimingSheet } = await import('./components/EndTimingSheet');
const { RotationSheet } = await import('./components/RotationSheet');
const { Settings } = await import('./components/Settings');
const { Stats } = await import('./components/Stats');
const { Calendar } = await import('./components/Calendar');
const { YearReview } = await import('./components/YearReview');
const { ForecastCard } = await import('./components/ForecastCard');
const { MissedPlansSheet } = await import('./components/MissedPlansSheet');
const { GoalSheet } = await import('./components/GoalSheet');
const { StartTimingSheet } = await import('./components/StartTimingSheet');
const { DEFAULT_TEMPLATES } = await import('./types');

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
  note: '加班',
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

const overtimeTemplate = {
  ...DEFAULT_TEMPLATES[0],
  overtime: { standardMinutes: 8 * 60, multiplier: 1.5 },
};

const active: ActiveShift = {
  templateId: DEFAULT_TEMPLATES[0].id,
  sourcePlanId: null,
  shiftName: DEFAULT_TEMPLATES[0].name,
  shiftColor: DEFAULT_TEMPLATES[0].color,
  startDate: '2026-10-26',
  startTime: '08:00',
  startedAt: Date.now() - 3 * 3600_000,
  pausedAt: null,
  pausedMs: 0,
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '',
};

describe('app smoke render', () => {
  it('renders the home screen with empty local data', () => {
    const html = renderToString(<App />);
    expect(html).toContain('工时账本');
    expect(html).toContain('记一班');
    expect(html).toContain('从第一班开始');
  });

  it('renders every sheet and screen', () => {
    const output = [
      renderToString(
        <RecordSheet
          templates={DEFAULT_TEMPLATES}
          onClose={noop}
          onSave={noop}
          recentRecord={record}
        />,
      ),
      renderToString(
        <RecordSheet templates={DEFAULT_TEMPLATES} record={record} onClose={noop} onSave={noop} onDelete={noop} />,
      ),
      renderToString(
        <RecordSheet templates={DEFAULT_TEMPLATES} plan={plan} onClose={noop} onSave={noop} />,
      ),
      renderToString(
        <PlanSheet
          templates={DEFAULT_TEMPLATES}
          defaultTemplate={DEFAULT_TEMPLATES[0]}
          reminderAvailable
          globalReminderEnabled
          globalReminderLeadMinutes={60}
          onClose={noop}
          onSave={noop}
        />,
      ),
      renderToString(
        <PlanSheet
          templates={DEFAULT_TEMPLATES}
          plan={plan}
          defaultTemplate={null}
          reminderAvailable={false}
          globalReminderEnabled={false}
          globalReminderLeadMinutes={60}
          onClose={noop}
          onSave={noop}
          onDelete={noop}
        />,
      ),
      renderToString(<TemplateSheet onClose={noop} onSave={noop} />),
      renderToString(
        <SettlementSheet
          monthLabel="2026年10月"
          baseEarnings={3200}
          baseMinutes={9000}
          workedDays={18}
          onClose={noop}
          onSave={noop}
          onShare={noop}
        />,
      ),
      renderToString(
        <EndTimingSheet shift={active} endTime="11:00" endAt={Date.now()} onClose={noop} onSave={noop} />,
      ),
      renderToString(
        <RotationSheet templates={DEFAULT_TEMPLATES} plans={[plan]} onClose={noop} onGenerate={noop} />,
      ),
      renderToString(<GoalSheet goal={5000} onClose={noop} onSave={noop} />),
      renderToString(
        <StartTimingSheet
          templates={DEFAULT_TEMPLATES}
          defaultTemplate={DEFAULT_TEMPLATES[0]}
          onClose={noop}
          onStart={noop}
        />,
      ),
      renderToString(
        <MissedPlansSheet
          plans={[plan]}
          records={[record]}
          activePlanId={null}
          onClose={noop}
          onRecord={noop}
          onSkip={noop}
        />,
      ),
      renderToString(
        <Calendar
          records={[record]}
          plans={[plan]}
          templates={DEFAULT_TEMPLATES}
          mode="plans"
          timingActive={false}
          activePlanId={null}
          reminderEnabled
          onModeChange={noop}
          onEditRecord={noop}
          onAddRecord={noop}
          onAddPlan={noop}
          onOpenBatch={noop}
          onOpenRotation={noop}
          onEditPlan={noop}
          onStartPlan={noop}
          onRecordPlan={noop}
        />,
      ),
      renderToString(
        <Stats
          records={[record]}
          plans={[plan]}
          planHistory={[{ ...plan, status: 'completed', recordId: record.id, completedAt: 1 }] as PlanHistoryEntry[]}
          activePlanId={null}
          monthlyGoal={5000}
          settlements={[]}
          onOpenSettlement={noop}
          onOpenMissed={noop}
        />,
      ),
      renderToString(
        <YearReview year={2026} records={[record]} onExport={noop} />,
      ),
      renderToString(
        <Settings
          templates={DEFAULT_TEMPLATES}
          recordCount={1}
          monthlyGoal={5000}
          theme="system"
          resolvedTheme="light"
          lastBackupAt={null}
          dayRule={DEFAULT_DAY_PAY_RULE}
          onAddTemplate={noop}
          onEditTemplate={noop}
          onEditGoal={noop}
          onDayRuleChange={noop}
          onThemeChange={noop}
          reminder={{
            supported: true,
            permission: 'granted',
            exactAlarm: 'denied',
            scheduled: 2,
            enabled: true,
            leadMinutes: 60,
          }}
          onToggleReminder={noop}
          onReminderLeadChange={noop}
          onRequestExactAlarm={noop}
          onExportJson={noop}
          onExportCsv={noop}
          onImportFile={noop}
          onImportCsv={noop}
          onClearRecords={noop}
          installAvailable={false}
          onInstall={noop}
          isStandalone={false}
        />,
      ),
    ];

    output.forEach((html) => expect(html.length).toBeGreaterThan(50));
    expect(output[0]).toContain('记一班');
    expect(output[2]).toContain('来自');
    expect(output[3]).toContain('排班提醒');
    expect(output[5]).toContain('新增班次');
    expect(output[6]).toContain('工资结算');
    expect(output[7]).toContain('结束打卡');
    expect(output[8]).toContain('轮班表');
    expect(output[13]).toContain('排班对账');
    expect(output[14]).toContain('年度复盘');
    expect(output[14]).toContain('heat-cell');
    expect(output[15]).toContain('about-version');
    expect(output[15]).toContain('工时账本 · v');
    expect(output[15]).toMatch(/\d+\.\d+\.\d+/);
  });

  it('renders 2.0 segmented pay and forecast UI', () => {
    const recordHtml = renderToString(
      <RecordSheet
        templates={[overtimeTemplate]}
        template={overtimeTemplate}
        onClose={noop}
        onSave={noop}
      />,
    );
    expect(recordHtml).toContain('加班分段');
    expect(recordHtml).toContain('标准工时');
    expect(recordHtml).toContain('1.5×');

    const templateHtml = renderToString(
      <TemplateSheet template={overtimeTemplate} onClose={noop} onSave={noop} />,
    );
    expect(templateHtml).toContain('加班分段');
    expect(templateHtml).toContain('加班 1.5×');

    const forecast: MonthForecast = {
      monthPrefix: '2026-10',
      recordedShifts: 1,
      recordedMinutes: 480,
      recordedEarnings: 160,
      recordedDays: 1,
      upcomingPlans: 1,
      upcomingMinutes: 480,
      upcomingEarnings: 160,
      upcomingDays: 1,
      projectedMinutes: 960,
      projectedEarnings: 320,
      goal: 1000,
      recordedPercent: 16,
      projectedPercent: 32,
      remainingToGoal: 840,
      projectedRemaining: 680,
      averageUpcomingEarning: 160,
      shiftsToGoal: 5,
    };
    const forecastHtml = renderToString(
      <ForecastCard forecast={forecast} monthLabel="2026年10月" />,
    );
    expect(forecastHtml).toContain('收入预测');
    expect(forecastHtml).toContain('32');
    expect(forecastHtml).toContain('还差 ¥680');
  });
});

describe('app render with seeded local data', () => {
  it('renders aggregated numbers from stored records and plans', () => {
    const store = new Map<string, string>();
    const localStorageStub = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = localStorageStub;

    store.set('shift-ledger.records.v2', JSON.stringify([record]));
    store.set(
      'shift-ledger.plans.v2',
      JSON.stringify([{ ...plan, date: '2099-01-05' }]),
    );
    store.set(
      'shift-ledger.preferences.v2',
      JSON.stringify({ monthlyGoal: 5000, theme: 'light', dayRule: DEFAULT_DAY_PAY_RULE }),
    );
    store.set(
      'shift-ledger.settlements.v2',
      JSON.stringify([
        {
          monthKey: '2026-10',
          status: 'paid',
          paidAt: '2026-11-05',
          paidAmount: 3000,
          note: '已结',
          adjustments: [{ id: 'a1', kind: 'bonus', label: '满勤', amount: 200 }],
          updatedAt: 1,
        },
      ]),
    );

    try {
      const html = renderToString(<App />);
      // 记录分组与合计来自 summarizeByDate / monthTotals
      expect(html).toContain('10月24日');
      expect(html).toContain('班次记录');
      // 目标进度来自月度汇总
      expect(html).toContain('月收入目标');
      // 未来排班进入「下一班」卡片
      expect(html).toContain('下一班');
      expect(html).toContain('1月5日');
    } finally {
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    }
  });
});
