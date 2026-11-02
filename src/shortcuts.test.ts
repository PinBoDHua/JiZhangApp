import { describe, expect, it } from 'vitest';
import { parseAppAction } from './shortcuts';

describe('app shortcuts', () => {
  it('reads the PWA action query', () => {
    expect(parseAppAction('/?action=record')).toBe('record');
    expect(parseAppAction('?action=stats')).toBe('stats');
    expect(parseAppAction('/#action=batch')).toBe('batch');
    expect(parseAppAction('https://example.com/app/?action=timing')).toBe('timing');
  });

  it('reads the Android custom scheme', () => {
    expect(parseAppAction('gongshi://record')).toBe('record');
    expect(parseAppAction('gongshi://timing')).toBe('timing');
    expect(parseAppAction('gongshi:///batch')).toBe('batch');
    expect(parseAppAction('gongshi://stats?from=shortcut')).toBe('stats');
  });

  it('ignores unknown or empty input', () => {
    expect(parseAppAction('')).toBeNull();
    expect(parseAppAction(null)).toBeNull();
    expect(parseAppAction('?action=delete')).toBeNull();
    expect(parseAppAction('gongshi://unknown')).toBeNull();
    expect(parseAppAction('https://example.com/')).toBeNull();
  });

  it('does not treat arbitrary URL paths as shortcuts', () => {
    // 只认 gongshi://：外部网页用 VIEW intent 打开 https://x/stats 不应驱动应用
    expect(parseAppAction('https://example.com/stats')).toBeNull();
    expect(parseAppAction('https://evil.test/record')).toBeNull();
    expect(parseAppAction('intent://batch')).toBeNull();
  });
});
