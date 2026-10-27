import { afterEach, describe, expect, it } from 'vitest';
import {
  navDirection,
  prefersReducedMotion,
  supportsViewTransition,
} from './motion';

interface FakeWindow {
  matchMedia: (query: string) => { matches: boolean };
}

const globalWithWindow = globalThis as unknown as { window?: FakeWindow };

function stubReducedMotion(matches: boolean): void {
  globalWithWindow.window = {
    matchMedia: () => ({ matches }),
  };
}

afterEach(() => {
  delete globalWithWindow.window;
});

describe('motion helpers', () => {
  it('moves forward when the tab index grows', () => {
    expect(navDirection('home', 'calendar')).toBe('forward');
    expect(navDirection('calendar', 'stats')).toBe('forward');
  });

  it('moves back when returning to an earlier tab', () => {
    expect(navDirection('settings', 'home')).toBe('back');
    expect(navDirection('stats', 'calendar')).toBe('back');
  });

  it('treats the same tab as forward for safety', () => {
    expect(navDirection('home', 'home')).toBe('forward');
  });

  it('reads the reduce-motion preference when available', () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('does not crash without a window', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reports no native View Transition outside the browser', () => {
    expect(supportsViewTransition()).toBe(false);
  });
});
