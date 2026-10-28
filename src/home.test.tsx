// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { Home } from './components/Home';
import { DEFAULT_TEMPLATES } from './types';
import type { WorkRecord } from './types';

afterEach(cleanup);

const noop = () => undefined;

function makeRecord(index: number, shiftName: string): WorkRecord {
  // 固定日期，避免依赖「今天」导致分组数量随运行时间变化
  const day = String(index + 1).padStart(2, '0');
  return {
    id: `record-${index}`,
    date: `2026-03-${day}`,
    templateId: DEFAULT_TEMPLATES[0].id,
    shiftName,
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
}

function renderHome(records: WorkRecord[]) {
  return render(
    <Home
      records={records}
      templates={DEFAULT_TEMPLATES}
      plans={[]}
      monthlyGoal={0}
      activeShift={null}
      onAddRecord={noop}
      onEditRecord={noop}
      onGoStats={noop}
      onGoWeekStats={noop}
      onStartTiming={noop}
      onStartPlan={noop}
      onRecordPlan={noop}
      onEditPlan={noop}
      onOpenMissed={noop}
      onClockOut={noop}
      onPauseTiming={noop}
      onResumeTiming={noop}
      onAbandonTiming={noop}
    />
  );
}

/**
 * 首页记录列表的交互契约。
 *
 * 这块逻辑最近动过（搜索词归一化、按日分组记忆化、分批展开），
 * 需要行为级证据：搜索结果计数、分页展开、清空搜索都要按原样工作。
 */
describe('首页记录列表', () => {
  it('记录超过 5 条才出现搜索框', () => {
    const { unmount } = renderHome([makeRecord(0, '白班'), makeRecord(1, '白班')]);
    expect(screen.queryByPlaceholderText(/搜索班次/)).toBeNull();
    unmount();

    renderHome(
      Array.from({ length: 6 }, (_, index) => makeRecord(index, '白班')),
    );
    expect(screen.getByPlaceholderText(/搜索班次/)).toBeInTheDocument();
  });

  it('搜索按班次名过滤并给出命中数量', async () => {
    const user = userEvent.setup();
    const records = [
      makeRecord(0, '白班'),
      makeRecord(1, '白班'),
      makeRecord(2, '白班'),
      makeRecord(3, '白班'),
      makeRecord(4, '夜班'),
      makeRecord(5, '夜班'),
    ];
    renderHome(records);

    await user.type(screen.getByPlaceholderText(/搜索班次/), '夜班');

    expect(screen.getByText('找到 2 条记录')).toBeInTheDocument();
  });

  it('清空搜索后回到全量列表', async () => {
    const user = userEvent.setup();
    const records = Array.from({ length: 6 }, (_, index) =>
      makeRecord(index, index < 4 ? '白班' : '夜班'),
    );
    renderHome(records);

    const input = screen.getByPlaceholderText(/搜索班次/);
    await user.type(input, '夜班');
    expect(screen.getByText('找到 2 条记录')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '清空搜索' }));
    expect(screen.getByText('一共 6 条记录')).toBeInTheDocument();
  });

  it('超过 10 天时先折叠，点「显示更早的记录」再展开', async () => {
    const user = userEvent.setup();
    // 15 天，每天 1 条 → 15 个日分组
    const records = Array.from({ length: 15 }, (_, index) => makeRecord(index, '白班'));
    renderHome(records);

    const more = screen.getByRole('button', { name: /显示更早的记录/ });
    expect(more).toHaveTextContent('还有 5 天');

    await user.click(more);

    expect(screen.queryByRole('button', { name: /显示更早的记录/ })).toBeNull();
  });
});
