// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { Stats } from './components/Stats';
import type { StatsPeriod } from './types';

const noop = () => undefined;

function renderStats(period: StatsPeriod, onPeriodChange = noop) {
  return render(
    <Stats
      records={[]}
      plans={[]}
      planHistory={[]}
      activePlanId={null}
      monthlyGoal={0}
      settlements={[]}
      onOpenSettlement={noop}
      onOpenMissed={noop}
      period={period}
      onPeriodChange={onPeriodChange}
    />,
  );
}

function activePeriodLabel(): string | null {
  return document.querySelector('.period-tabs .is-active')?.textContent ?? null;
}

afterEach(cleanup);

describe('统计周期由外壳控制', () => {
  it('外部把周期改成“本周”时立即生效', () => {
    const { rerender } = renderStats('month');
    expect(activePeriodLabel()).toBe('本月');

    rerender(
      <Stats
        records={[]}
        plans={[]}
        planHistory={[]}
        activePlanId={null}
        monthlyGoal={0}
        settlements={[]}
        onOpenSettlement={noop}
        onOpenMissed={noop}
        period="week"
        onPeriodChange={noop}
      />,
    );

    // 过去这里是 useState(initialPeriod)，已挂载的页面会忽略这次变化
    expect(activePeriodLabel()).toBe('本周');
  });

  it('点击周期会通知外壳，并等待新 prop 生效', async () => {
    const user = userEvent.setup();
    const onPeriodChange = vi.fn();
    renderStats('month', onPeriodChange);

    await user.click(screen.getByRole('button', { name: '今年' }));

    expect(onPeriodChange).toHaveBeenCalledWith('year');
    // 受控组件：自己的状态不变，直到外壳把新值传回来
    expect(activePeriodLabel()).toBe('本月');
  });
});
