// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMultiTabGuard } from './hooks/useMultiTabGuard';

/** 用内存总线模拟 BroadcastChannel：不投递给发送者自己 */
class FakeChannel extends EventTarget {
  static instances = new Set<FakeChannel>();
  constructor() {
    super();
    FakeChannel.instances.add(this);
  }
  postMessage(data: unknown): void {
    const payload = { data };
    for (const channel of FakeChannel.instances) {
      if (channel === this) continue;
      queueMicrotask(() => {
        if (FakeChannel.instances.has(channel)) {
          channel.dispatchEvent(Object.assign(new Event('message'), payload));
        }
      });
    }
  }
  close(): void {
    FakeChannel.instances.delete(this);
  }
}

beforeEach(() => {
  FakeChannel.instances.clear();
  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = FakeChannel;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('多标签页检测', () => {
  it('只有一个窗口时不提示', async () => {
    const { result } = renderHook(() => useMultiTabGuard());
    await waitFor(() => expect(result.current.hasOtherTabs).toBe(false));
  });

  it('打开第二个窗口后两个窗口都会提示', async () => {
    const first = renderHook(() => useMultiTabGuard());
    const second = renderHook(() => useMultiTabGuard());

    await waitFor(() => expect(first.result.current.hasOtherTabs).toBe(true));
    await waitFor(() => expect(second.result.current.hasOtherTabs).toBe(true));
  });

  it('另一个窗口关闭后提示会消失', async () => {
    const first = renderHook(() => useMultiTabGuard());
    const second = renderHook(() => useMultiTabGuard());
    await waitFor(() => expect(first.result.current.hasOtherTabs).toBe(true));

    second.unmount();
    await waitFor(() => expect(first.result.current.hasOtherTabs).toBe(false));
  });

  it('可以手动忽略提示', async () => {
    const first = renderHook(() => useMultiTabGuard());
    renderHook(() => useMultiTabGuard());
    await waitFor(() => expect(first.result.current.hasOtherTabs).toBe(true));

    act(() => first.result.current.dismiss());
    expect(first.result.current.dismissed).toBe(true);
  });
});
