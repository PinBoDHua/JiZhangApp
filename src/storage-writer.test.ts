import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WRITE_DELAY_MS,
  createWriteQueue,
  flushActiveWrites,
  setActiveWriteQueue,
} from './storage/writer';

describe('createWriteQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes nothing before the delay and flushes once after it', () => {
    const queue = createWriteQueue();
    const write = vi.fn();

    queue.schedule('records', write);
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WRITE_DELAY_MS - 1);
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest task for the same key', () => {
    const queue = createWriteQueue();
    const first = vi.fn();
    const second = vi.fn();

    queue.schedule('records', first);
    queue.schedule('records', second);
    queue.flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('writes several collections in one batch', () => {
    const queue = createWriteQueue();
    const records = vi.fn();
    const plans = vi.fn();
    const preferences = vi.fn();

    queue.schedule('records', records);
    queue.schedule('plans', plans);
    queue.schedule('preferences', preferences);
    vi.advanceTimersByTime(WRITE_DELAY_MS);

    expect(records).toHaveBeenCalledTimes(1);
    expect(plans).toHaveBeenCalledTimes(1);
    expect(preferences).toHaveBeenCalledTimes(1);
  });

  it('does not postpone the timer when more changes arrive', () => {
    const queue = createWriteQueue();
    const records = vi.fn();
    const plans = vi.fn();

    queue.schedule('records', records);
    vi.advanceTimersByTime(WRITE_DELAY_MS - 50);
    // 第二笔变更在窗口末尾进来，不应该把落盘时间再往后推 200ms
    queue.schedule('plans', plans);
    vi.advanceTimersByTime(50);

    expect(records).toHaveBeenCalledTimes(1);
    expect(plans).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately and cancels the pending timer', () => {
    const queue = createWriteQueue();
    const write = vi.fn();

    queue.schedule('records', write);
    expect(queue.hasPending()).toBe(true);

    queue.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.hasPending()).toBe(false);

    // 原定时器已被取消，不会重复写入
    vi.advanceTimersByTime(WRITE_DELAY_MS * 2);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is pending', () => {
    const queue = createWriteQueue();
    expect(() => queue.flush()).not.toThrow();
    expect(queue.hasPending()).toBe(false);
  });

  it('starts a fresh batch after a flush', () => {
    const queue = createWriteQueue();
    const first = vi.fn();
    const second = vi.fn();

    queue.schedule('records', first);
    queue.flush();
    queue.schedule('records', second);
    vi.advanceTimersByTime(WRITE_DELAY_MS);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps writing the other collections when one throws', () => {
    const queue = createWriteQueue();
    const broken = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    const healthy = vi.fn();

    queue.schedule('records', broken);
    queue.schedule('plans', healthy);
    expect(() => queue.flush()).not.toThrow();

    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom delay', () => {
    const queue = createWriteQueue(50);
    const write = vi.fn();

    queue.schedule('records', write);
    vi.advanceTimersByTime(49);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('flushes the registered queue from non-hook code paths', () => {
    const queue = createWriteQueue();
    const write = vi.fn();
    queue.schedule('records', write);

    flushActiveWrites();
    expect(write).not.toHaveBeenCalled();

    setActiveWriteQueue(queue);
    flushActiveWrites();
    expect(write).toHaveBeenCalledTimes(1);

    // 解除注册后不应再影响其它队列
    setActiveWriteQueue(null);
    const later = vi.fn();
    queue.schedule('records', later);
    flushActiveWrites();
    expect(later).not.toHaveBeenCalled();
  });
});
