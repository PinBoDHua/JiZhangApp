import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ActiveShift, PlanHistoryEntry, PlannedShift, WorkRecord } from './types';

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
        <Settings
          templates={DEFAULT_TEMPLATES}
          recordCount={1}
          monthlyGoal={5000}
          theme="system"
          resolvedTheme="light"
          lastBackupAt={null}
          onAddTemplate={noop}
          onEditTemplate={noop}
          onEditGoal={noop}
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
    expect(output[14]).toContain('about-version');
    expect(output[14]).toContain('工时账本 · v');
    expect(output[14]).toMatch(/\d+\.\d+\.\d+/);
  });
});
