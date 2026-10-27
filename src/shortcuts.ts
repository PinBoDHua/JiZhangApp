/**
 * 应用快捷方式（2.2）：
 * - PWA manifest 用 `/?action=record`；
 * - Android 桌面长按快捷方式用 `gongshi://record`；
 * - 两种入口统一解析成同一种动作，交给 App 打开对应浮层。
 */

export type AppShortcut = 'record' | 'timing' | 'batch' | 'stats';

const SHORTCUTS: readonly AppShortcut[] = ['record', 'timing', 'batch', 'stats'];

function normalize(value: string | undefined): AppShortcut | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return (SHORTCUTS as readonly string[]).includes(key)
    ? (key as AppShortcut)
    : null;
}

export function parseAppAction(input: string | null | undefined): AppShortcut | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // /?action=record、/#action=record
  const queryMatch = /[?&#]action=([a-z]+)/i.exec(trimmed);
  if (queryMatch) return normalize(queryMatch[1]);

  // gongshi://record 或 gongshi:///batch
  const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/i.exec(trimmed);
  if (schemeMatch) {
    return normalize(schemeMatch[1]) ?? normalize(schemeMatch[2].replace(/^\/+/, ''));
  }

  return null;
}
