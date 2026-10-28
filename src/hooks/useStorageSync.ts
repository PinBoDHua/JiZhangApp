import { useEffect } from 'react';
import { isLedgerStorageKey } from '../storage';

/**
 * 跨标签页同步：同一浏览器里另一个窗口改动了数据时，本页重新读入，
 * 避免两个窗口各写各的、最后用旧数据覆盖新数据。
 *
 * storage 事件只在「其它文档」写入时触发，因此不会自我循环。
 */
export function useStorageSync(reload: () => void): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame: number | null = null;
    const onStorage = (event: StorageEvent) => {
      // key 为 null 表示其它页面调用了 localStorage.clear()
      if (event.key !== null && !isLedgerStorageKey(event.key)) return;
      // 一次操作可能连续改多个键，合并成一次重载
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        reload();
      });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [reload]);
}
