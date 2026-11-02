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
      color: theme === 'dark' ? '#101613' : '#f6f3ed',
    });
  } catch {
    // 边到边模式下不允许改背景色
  }
}

/** 导出文件统一用这两个前缀命名，便于清理历史残留 */
const EXPORT_PREFIXES = ['工时账本-', '工资条-'];

/**
 * 清掉上一次导出的临时文件。
 *
 * 每次都写同名文件会把 Cache 越堆越多（每天一份备份，一个月就是三十份）；
 * 这里在写新文件前顺手删掉同前缀的旧文件，既控制体积又不影响本次分享。
 */
async function purgeExportCache(keep: string): Promise<void> {
  try {
    const listing = await Filesystem.readdir({ path: '', directory: Directory.Cache });
    const stale = listing.files
      .map((file) => file.name)
      .filter(
        (name) =>
          name !== keep && EXPORT_PREFIXES.some((prefix) => name.startsWith(prefix)),
      );
    await Promise.all(
      stale.map((name) =>
        Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined),
      ),
    );
  } catch {
    // 清理失败不影响本次导出
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

  await purgeExportCache(filename);

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
