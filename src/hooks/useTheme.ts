import { useEffect, useState } from 'react';
import { applyNativeStatusBar } from '../native';
import type { ThemePreference } from '../types';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

function readSystemDark(): boolean {
  // 旧 WebView / 测试环境可能没有 matchMedia，读不到就按浅色处理
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 解析实际主题（跟随系统时读系统偏好），并同步到文档、状态栏和浏览器主题色 */
export function useTheme(theme: ThemePreference): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(readSystemDark);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useIsomorphicLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', resolvedTheme === 'dark' ? '#101613' : '#f6f3ed');
    // 状态栏样式属于装饰：原生侧失败不应该影响页面本身
    void applyNativeStatusBar(resolvedTheme).catch(() => undefined);
  }, [resolvedTheme]);

  return resolvedTheme;
}
