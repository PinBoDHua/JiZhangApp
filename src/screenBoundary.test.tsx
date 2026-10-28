// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { ScreenBoundary } from './components/ScreenBoundary';

afterEach(cleanup);

function Boom(): ReactNode {
  throw new Error('渲染炸了');
}

/**
 * 页面级错误边界。
 *
 * 必须用真实 DOM 环境（happy-dom）：`renderToString` 的服务端渲染不走
 * getDerivedStateFromError，异常会直接冒泡，测不到降级 UI，更测不到「重试」。
 */
describe('页面级错误边界', () => {
  it('正常时原样渲染子树', () => {
    render(
      <ScreenBoundary screen="记录">
        <p>正常内容</p>
      </ScreenBoundary>,
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('子树抛错时渲染降级 UI，保留页面名与原始错误', () => {
    // 边界按设计会 console.error，测试里静音
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(
        <ScreenBoundary screen="统计">
          <Boom />
        </ScreenBoundary>,
      );
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('「统计」没能显示出来');
      expect(alert).toHaveTextContent('渲染炸了');
      expect(alert).toHaveTextContent('数据仍在');
    } finally {
      spy.mockRestore();
    }
  });

  it('点「重试」后就地重建子树，不必刷新整页', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // 故障开关放在渲染之外：React 内部可能重试渲染，
    // 若在渲染期翻转它，第一次渲染就会「自愈」，测不到降级态
    const fault = { active: true };
    function Flaky(): ReactNode {
      if (fault.active) throw new Error('一次性故障');
      return <p>已经恢复</p>;
    }
    try {
      render(
        <ScreenBoundary screen="日历">
          <Flaky />
        </ScreenBoundary>,
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();

      fault.active = false;
      await user.click(screen.getByRole('button', { name: '重试' }));

      expect(screen.getByText('已经恢复')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
