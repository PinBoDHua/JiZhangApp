import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { downloadFile } from './utils';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function applyNativeStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setBackgroundColor({
      color: theme === 'dark' ? '#0f1512' : '#f4f0e7',
    });
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
  } catch {
    // 某些 Android 版本不支持动态状态栏，保持系统默认即可
  }
}

export async function exportFile(
  filename: string,
  content: string,
  mime: string,
): Promise<void> {
  if (!isNativeApp()) {
    downloadFile(filename, content, mime);
    return;
  }

  const file = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  await Share.share({
    title: filename,
    dialogTitle: '保存或分享备份',
    files: [file.uri],
  });
}
