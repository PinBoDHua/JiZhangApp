import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { parseAppAction, type AppShortcut } from '../shortcuts';
import type { Tab } from '../types';

/**
 * 应用外壳与系统导航的接驳层。
 *
 * 这里的两个 effect 都需要「只注册一次监听」，但触发时要读到最新的处理函数。
 * 以前它们写在 App 里、依赖里带着 defaultTemplate / sheet / tab，于是每次
 * 记录变化都会重新 addListener、重新 getLaunchUrl；虽然结果正确，但白白多了
 * 一轮原生桥调用。改成「ref 存最新值 + 空依赖注册」后，注册次数与业务变化解耦。
 */

/** 快捷方式统一入口：PWA 的 ?action= 与 Android 的 gongshi:// 都走这里 */
export function useAppShortcuts(onShortcut: (action: AppShortcut) => void): void {
  const handlerRef = useRef(onShortcut);
  useEffect(() => {
    handlerRef.current = onShortcut;
  }, [onShortcut]);

  // 用 ref 记住已处理的 launch URL：StrictMode 下 effect 会跑两次，避免重复打开浮层
  const handledLaunchUrl = useRef<string | null>(null);

  useEffect(() => {
    const run = (action: AppShortcut) => handlerRef.current(action);
    const initial = parseAppAction(`${window.location.search}${window.location.hash}`);
    let timer: number | null = null;
    if (initial) {
      // 先清掉 query，避免依赖变化重跑时重复打开
      window.history.replaceState(null, '', window.location.pathname);
      // 延后一帧执行，等首次渲染和默认模板就绪后再打开浮层
      timer = window.setTimeout(() => run(initial), 0);
    }
    if (!Capacitor.isNativePlatform()) {
      return () => {
        if (timer !== null) window.clearTimeout(timer);
      };
    }

    let disposed = false;
    let remove: (() => void) | undefined;
    // 冷启动：快捷方式通过 launch intent 进入时，App 插件不一定补发 appUrlOpen
    void CapacitorApp.getLaunchUrl()
      .then((result) => {
        if (!result?.url || handledLaunchUrl.current === result.url) return;
        handledLaunchUrl.current = result.url;
        const action = parseAppAction(result.url);
        if (action) run(action);
      })
      .catch(() => {
        // 没有 launch URL 时插件可能直接 reject，忽略即可
      });
    void CapacitorApp.addListener('appUrlOpen', (event) => {
      const action = parseAppAction(event.url);
      if (action) run(action);
    }).then((handle) => {
      remove = () => void handle.remove();
      if (disposed) remove();
    });

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      disposed = true;
      remove?.();
    };
  }, []);
}

interface BackButtonOptions {
  confirmOpen: boolean;
  sheetOpen: boolean;
  tab: Tab;
  onCloseConfirm: () => void;
  onCloseSheet: () => void;
  onGoHome: () => void;
}

/**
 * Android 返回键：按「确认框 → 浮层 → 回到首页 → 退出」的优先级逐层消费。
 * 状态通过 ref 读取，监听只注册一次。
 */
export function useAppBackButton(options: BackButtonOptions): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let remove: (() => void) | undefined;
    void CapacitorApp.addListener('backButton', () => {
      const current = latest.current;
      if (current.confirmOpen) {
        current.onCloseConfirm();
        return;
      }
      if (current.sheetOpen) {
        current.onCloseSheet();
        return;
      }
      if (current.tab !== 'home') {
        current.onGoHome();
        return;
      }
      void CapacitorApp.exitApp();
    }).then((handle) => {
      remove = () => void handle.remove();
      if (disposed) remove();
    });
    return () => {
      disposed = true;
      remove?.();
    };
  }, []);
}
