import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar } from '@capacitor/status-bar';
import { downloadFile } from './utils';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function applyNativeStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Android 15+ 强制边到边，背景色由内容决定，只能用 SystemBars 控制图标明暗
    await SystemBars.setStyle({
      style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    });
  } catch {
    // 更老的系统走下面的状态栏插件
  }
  try {
    // Android 14 及以下仍可设置状态栏底色；15+ 会被系统忽略，忽略异常即可
    await StatusBar.setBackgroundColor({
      color: theme === 'dark' ? '#0f1512' : '#f4f0e7',
    });
  } catch {
    // 边到边模式下不允许改背景色
  }
}

export async function exportFile(
  filename: string,
  content: string,
  mime: string,
  dialogTitle = '保存或分享文件',
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
    dialogTitle,
    files: [file.uri],
  });
}
