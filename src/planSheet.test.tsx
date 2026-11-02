// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { PlanSheet } from './components/PlanSheet';
import { DEFAULT_DAY_PAY_RULE, DEFAULT_TEMPLATES, type PlannedShift } from './types';

const noop = () => undefined;

function occupiedPlan(id: string, date: string): PlannedShift {
  return {
    id,
    date,
    templateId: DEFAULT_TEMPLATES[0].id,
    shiftName: DEFAULT_TEMPLATES[0].name,
    shiftColor: DEFAULT_TEMPLATES[0].color,
    start: DEFAULT_TEMPLATES[0].start,
    end: DEFAULT_TEMPLATES[0].end,
    breakMinutes: DEFAULT_TEMPLATES[0].breakMinutes,
    rate: DEFAULT_TEMPLATES[0].rate,
    multiplier: 1,
    note: '',
    createdAt: 1,
    updatedAt: 1,
  };
}

function renderSheet(plans: PlannedShift[]) {
  return render(
    <PlanSheet
      templates={DEFAULT_TEMPLATES}
      plans={plans}
      defaultTemplate={DEFAULT_TEMPLATES[0]}
      initialDate="2026-11-07"
      dayRule={DEFAULT_DAY_PAY_RULE}
      reminderAvailable={false}
      globalReminderEnabled={false}
      globalReminderLeadMinutes={60}
      onClose={noop}
      onSave={noop}
    />,
  );
}

afterEach(cleanup);

describe('重复排班预览与实际保存同一口径', () => {
  it('预览跳过的日期不算进班数与金额', async () => {
    const user = userEvent.setup();
    // 11-07 起每周一次，共 4 周；其中两天已有排班
    renderSheet([occupiedPlan('p2', '2026-11-14'), occupiedPlan('p3', '2026-11-28')]);

    await user.click(screen.getByRole('button', { name: '4 周' }));

    expect(screen.getByText(/共 2 班预计/)).toBeInTheDocument();
    // 预览合计和“重复”说明各提示一次
    expect(screen.getAllByText(/跳过 2 天已有排班/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /保存 2 个排班/ })).toBeInTheDocument();
  });

  it('全部日期都被占用时禁用保存并给出原因', async () => {
    const user = userEvent.setup();
    renderSheet([
      occupiedPlan('p1', '2026-11-07'),
      occupiedPlan('p2', '2026-11-14'),
      occupiedPlan('p3', '2026-11-21'),
      occupiedPlan('p4', '2026-11-28'),
    ]);

    await user.click(screen.getByRole('button', { name: '4 周' }));

    expect(screen.getByText(/这些日期都已有排班/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存排班' })).toBeDisabled();
  });

  it('单日排班不受已有排班影响（允许一天多班）', async () => {
    renderSheet([occupiedPlan('p1', '2026-11-07')]);

    // 不重复时仍可保存：一天多班是允许的
    expect(screen.getByRole('button', { name: '保存排班' })).toBeEnabled();
    expect(screen.getByText('预计收入')).toBeInTheDocument();
  });
});
