// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { RecordSheet } from './components/RecordSheet';
import { DEFAULT_TEMPLATES } from './types';
import type { RecordInput, WorkRecord } from './types';

afterEach(cleanup);

const noop = () => undefined;
const dayShift = DEFAULT_TEMPLATES[0]; // 白班 08:00–17:00，休息 60，时薪 20

/** 预计收入区域的纯文本，避免依赖被拆成多个节点的金额片段 */
const previewText = () => document.querySelector('.pay-preview-main')?.textContent ?? '';
/** 金额下方的工时/时薪说明 */
const previewMeta = () => document.querySelector('.pay-preview-meta')?.textContent ?? '';

const editingRecord: WorkRecord = {
  id: 'record-1',
  date: '2026-10-24',
  templateId: dayShift.id,
  shiftName: dayShift.name,
  shiftColor: dayShift.color,
  start: '08:00',
  end: '17:00',
  breakMinutes: 60,
  rate: 20,
  multiplier: 1,
  note: '原备注',
  createdAt: 1,
  updatedAt: 1,
};

/**
 * 记账表单的交互契约。
 *
 * 这是整个应用最核心的输入路径：用户填的时间、时薪、休息、倍数，
 * 经过表单校验后必须原样（且只按约定规则修剪）落到 RecordInput 上。
 * 之前的测试只验证「能渲染出来」，算错字段也发现不了。
 */
describe('记一班表单', () => {
  it('从模板带入时间和时薪，保存时交给动作层', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(input: RecordInput) => void>();
    render(
      <RecordSheet
        templates={[dayShift]}
        template={dayShift}
        onClose={noop}
        onSave={onSave}
      />,
    );

    // 8 小时 × 20 元 = 160
    expect(previewText()).toContain('160');

    await user.click(screen.getByRole('button', { name: '保存记录' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      templateId: dayShift.id,
      shiftName: dayShift.name,
      start: '08:00',
      end: '17:00',
      breakMinutes: 60,
      rate: 20,
      multiplier: 1,
      note: '',
    });
  });

  it('改时薪后预计收入实时重算', async () => {
    const user = userEvent.setup();
    render(
      <RecordSheet templates={[dayShift]} template={dayShift} onClose={noop} onSave={noop} />,
    );

    const rate = screen.getByLabelText('时薪');
    await user.clear(rate);
    await user.type(rate, '40');

    // 8 小时 × 40 元 = 320
    expect(previewText()).toContain('320');
  });

  it('备注首尾空格在保存时被修剪', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(input: RecordInput) => void>();
    render(
      <RecordSheet templates={[dayShift]} template={dayShift} onClose={noop} onSave={onSave} />,
    );

    await user.type(screen.getByPlaceholderText(/可选/), '  顶班  ');
    await user.click(screen.getByRole('button', { name: '保存记录' }));

    expect(onSave.mock.calls[0][0].note).toBe('顶班');
  });

  it('班次名为空时禁用保存并给出提示', () => {
    render(<RecordSheet templates={[dayShift]} onClose={noop} onSave={noop} />);

    expect(screen.getByRole('alert')).toHaveTextContent('请填写班次名称');
    expect(screen.getByRole('button', { name: '保存记录' })).toBeDisabled();
  });

  it('下班早于上班时按跨越午夜计算', () => {
    render(
      <RecordSheet templates={[dayShift]} template={dayShift} onClose={noop} onSave={noop} />,
    );

    // type="time" 的完整值用 change 事件最稳（逐字符输入会触发中间态）
    fireEvent.change(screen.getByLabelText('结束'), { target: { value: '02:00' } });

    expect(screen.getByText(/已自动按跨越午夜计算/)).toBeInTheDocument();
    // 08:00 → 次日 02:00 共 18 小时，扣 1 小时休息 = 17 小时 × 20 元 = 340
    expect(previewMeta()).toContain('17 小时');
    expect(previewText()).toContain('340');
  });

  it('休息时长超过总时长时报错并禁用保存', () => {
    render(
      <RecordSheet templates={[dayShift]} template={dayShift} onClose={noop} onSave={noop} />,
    );

    fireEvent.change(screen.getByLabelText('休息分钟数'), { target: { value: '600' } });

    expect(screen.getByRole('alert')).toHaveTextContent('休息时长不能超过班次总时长');
    expect(screen.getByRole('button', { name: '保存记录' })).toBeDisabled();
  });

  it('编辑已有记录时展示原值，删除按钮走独立回调', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <RecordSheet
        templates={[dayShift]}
        record={editingRecord}
        onClose={noop}
        onSave={noop}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('编辑记录')).toBeInTheDocument();
    expect(screen.getByDisplayValue('原备注')).toBeInTheDocument();
    // 记录允许改日期（用户可能记错日子），日期框要回填原值
    expect(screen.getByLabelText('工作日期')).toHaveValue(editingRecord.date);

    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
