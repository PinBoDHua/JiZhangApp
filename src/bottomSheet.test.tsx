// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BottomSheet } from './components/BottomSheet';

function renderSheet(dirty: boolean, onClose = vi.fn()) {
  render(
    <BottomSheet title="测试浮层" onClose={onClose} dirty={dirty}>
      <input aria-label="备注" />
    </BottomSheet>,
  );
  const backdrop = document.querySelector('.sheet-backdrop');
  if (!backdrop) throw new Error('backdrop missing');
  return { onClose, backdrop };
}

afterEach(cleanup);

describe('BottomSheet 误触关闭保护', () => {
  it('有未保存内容时点遮罩不关闭，并给出提示', () => {
    const { onClose, backdrop } = renderSheet(true);
    fireEvent.mouseDown(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/还有未保存的内容/)).toBeInTheDocument();
  });

  it('没有修改时点遮罩正常关闭', () => {
    const { onClose, backdrop } = renderSheet(false);
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('关闭按钮始终可用（明确放弃编辑）', () => {
    const { onClose } = renderSheet(true);
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 在 dirty 时也不会关闭', () => {
    const { onClose } = renderSheet(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
