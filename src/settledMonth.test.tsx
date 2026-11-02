// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RecordSheet } from './components/RecordSheet';
import { DEFAULT_TEMPLATES, type MonthlySettlement, type WorkRecord } from './types';

const noop = () => undefined;

const record: WorkRecord = {
  id: 'r1',
  date: '2026-11-02',
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

function settlement(status: MonthlySettlement['status'], monthKey = '2026-11'): MonthlySettlement {
  return {
    monthKey,
    status,
    paidAt: status === 'paid' ? '2026-12-01' : null,
    paidAmount: status === 'paid' ? 3200 : null,
    note: '',
    adjustments: [],
    updatedAt: 1,
  };
}

function renderSheet(settlements: MonthlySettlement[]) {
  render(
    <RecordSheet
      templates={DEFAULT_TEMPLATES}
      record={record}
      settlements={settlements}
      onClose={noop}
      onSave={noop}
    />,
  );
}

afterEach(cleanup);

describe('已结算月份的改动提醒', () => {
  it('该月已到账时提示会同步影响应发', () => {
    renderSheet([settlement('paid')]);
    expect(screen.getByText(/已经结算到账/)).toBeInTheDocument();
  });

  it('该月只是待到账时不提示', () => {
    renderSheet([settlement('pending')]);
    expect(screen.queryByText(/已经结算到账/)).not.toBeInTheDocument();
  });

  it('结算的是其它月份时不提示', () => {
    renderSheet([settlement('paid', '2026-10')]);
    expect(screen.queryByText(/已经结算到账/)).not.toBeInTheDocument();
  });

  it('没有结算数据时正常渲染', () => {
    render(
      <RecordSheet templates={DEFAULT_TEMPLATES} record={record} onClose={noop} onSave={noop} />,
    );
    expect(screen.queryByText(/已经结算到账/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存修改' })).toBeInTheDocument();
  });
});
