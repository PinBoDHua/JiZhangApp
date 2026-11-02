import { useEffect, useState } from 'react';

const CHANNEL_NAME = 'shift-ledger:tabs';
/** 心跳间隔：足够及时发现另一个窗口，又不至于太吵 */
const HEARTBEAT_MS = 5000;
/** 超过这个时间没收到心跳就当对方已关闭 */
const STALE_MS = 15000;

interface TabMessage {
  type?: string;
  id?: string;
}

/**
 * 检测是否有另一个窗口也开着应用。
 *
 * 同一份 localStorage 被两个窗口同时写时只能是 last-write-wins，挨个字段合并需要
 * 墓碑标记才能正确处理删除，成本远高于收益。更划算的做法是从源头避免：
 * 检测到第二个窗口就提示用户只留一个，把冲突挡在发生之前。
 *
 * 用 BroadcastChannel 而不是 localStorage 心跳：后者会自己触发 storage 事件，
 * 与跨标签页同步逻辑相互干扰。
 */
export function useMultiTabGuard(): { hasOtherTabs: boolean; dismissed: boolean; dismiss: () => void } {
  const [hasOtherTabs, setHasOtherTabs] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof BroadcastChannel !== 'function') return;
    const id = Math.random().toString(36).slice(2);
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return;
    }

    const peers = new Map<string, number>();
    const sync = () => setHasOtherTabs(peers.size > 0);

    const onMessage = (event: MessageEvent<TabMessage>) => {
      const data = event.data;
      if (!data || typeof data.id !== 'string' || data.id === id) return;
      if (data.type === 'bye') {
        if (peers.delete(data.id)) sync();
        return;
      }
      // 新窗口广播 hello 时回一句 ack，让它立刻知道这里已经有一个了
      if (data.type === 'hello') channel.postMessage({ type: 'hello-ack', id });
      peers.set(data.id, Date.now());
      sync();
    };

    channel.addEventListener('message', onMessage as EventListener);
    channel.postMessage({ type: 'hello', id });

    const timer = window.setInterval(() => {
      channel.postMessage({ type: 'ping', id });
      const now = Date.now();
      let changed = false;
      peers.forEach((seenAt, peer) => {
        if (now - seenAt > STALE_MS) {
          peers.delete(peer);
          changed = true;
        }
      });
      if (changed) sync();
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
      channel.postMessage({ type: 'bye', id });
      channel.removeEventListener('message', onMessage as EventListener);
      channel.close();
    };
  }, []);

  return { hasOtherTabs, dismissed, dismiss: () => setDismissed(true) };
}
