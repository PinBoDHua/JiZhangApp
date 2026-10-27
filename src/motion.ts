import { flushSync } from 'react-dom';
import type { Tab } from './types';

export type NavDirection = 'forward' | 'back';

interface ViewTransitionLike {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

const TAB_ORDER: Tab[] = ['home', 'calendar', 'stats', 'settings'];

/** 系统开启「减少动态效果」时，所有 JS 驱动的动效都要让路。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function supportsViewTransition(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as ViewTransitionDocument).startViewTransition === 'function';
}

/**
 * 记录当前环境能否使用 View Transitions。CSS 里的旧版进场动画
 * 只在没有原生过渡能力时兜底，避免两套动画叠加。
 */
export function initMotion(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.motion = supportsViewTransition()
    ? 'view-transition'
    : 'css';
}

/** 根据底部导航的顺序推断页面切换方向，让横向过渡符合空间直觉。 */
export function navDirection(from: Tab, to: Tab): NavDirection {
  const fromIndex = TAB_ORDER.indexOf(from);
  const toIndex = TAB_ORDER.indexOf(to);
  return toIndex >= fromIndex ? 'forward' : 'back';
}

function canTransition(): boolean {
  if (!supportsViewTransition() || prefersReducedMotion()) return false;
  if (typeof document === 'undefined') return false;
  // 同一时间只跑一个页面级过渡，避免快速连点把快照搅乱
  return document.documentElement.dataset.vtActive !== '1';
}

function cleanup(kind: 'nav' | 'theme'): void {
  const root = document.documentElement;
  delete root.dataset.vtActive;
  if (root.dataset.vtKind === kind) delete root.dataset.vtKind;
  delete root.dataset.navDirection;
  delete root.dataset.vtOrigin;
  root.style.removeProperty('--vt-x');
  root.style.removeProperty('--vt-y');
  root.style.removeProperty('--vt-r');
}

function runViewTransition(
  kind: 'nav' | 'theme',
  update: () => void,
  configure?: (root: HTMLElement) => void,
): boolean {
  if (!canTransition()) {
    update();
    return false;
  }
  const root = document.documentElement;
  const doc = document as ViewTransitionDocument;
  root.dataset.vtActive = '1';
  root.dataset.vtKind = kind;
  configure?.(root);

  let updated = false;
  try {
    const transition = doc.startViewTransition!(() => {
      updated = true;
      // React 的状态更新默认是异步的，必须同步提交，快照才能拿到新页面
      flushSync(update);
    });
    void transition.finished.catch(() => undefined).finally(() => cleanup(kind));
    return true;
  } catch {
    cleanup(kind);
    if (!updated) update();
    return false;
  }
}

/** 底部标签页切换：旧页淡出，新页从行进方向轻微滑入。 */
export function runScreenTransition(update: () => void, direction: NavDirection): boolean {
  return runViewTransition('nav', update, (root) => {
    root.dataset.navDirection = direction;
  });
}

/**
 * 主题切换：从点击位置做一个圆形显影；拿不到坐标时退回原生交叉淡入。
 * 该动效灵感来自 Android 的 Material You 与 Telegram 的主题切换。
 */
export function runThemeTransition(
  update: () => void,
  origin?: { x: number; y: number },
): boolean {
  return runViewTransition('theme', update, (root) => {
    if (!origin) return;
    const x = Math.min(Math.max(0, origin.x), window.innerWidth);
    const y = Math.min(Math.max(0, origin.y), window.innerHeight);
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    root.dataset.vtOrigin = '1';
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${radius}px`);
  });
}
