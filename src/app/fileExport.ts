import { Capacitor } from '@capacitor/core';
import { exportFile } from '../native';

/**
 * 系统分享面板被用户取消时的报错形态各家不同，统一用关键字判断。
 *
 * 只匹配“整条消息就是取消”这一种形态：插件抛的是 `Share canceled`，
 * 而 `/cancel/i` 会把路径里带 cancel 的文件名错误也当成取消，导致真实
 * 失败被静默吞掉（既不提示，也不更新“上次备份时间”）。
 */
export function isCancelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /^(share\s+)?cancel(?:l)?ed$/i.test(message.trim());
}

/**
 * 分享面板还没关闭时再次点导出：插件会直接 reject。
 * 这不是失败，提示用户稍后再试即可，不该显示“导出失败”。
 */
export function isShareBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /sharing is in progress/i.test(message);
}

export interface SaveTextFileOptions {
  filename: string;
  content: string;
  mime: string;
  dialogTitle: string;
  /** 原生端（分享面板）成功后的提示 */
  nativeSuccess: string;
  /** 网页端（下载）成功后的提示 */
  webSuccess: string;
  failure: string;
}

/**
 * 保存 / 分享一个文本文件，并把「取消」当作静默成功处理。
 * 备份、表格、工资条、年度报告四处导出共用，避免 cancel 判断各写一遍。
 * 返回是否真的导出成功（取消算 false）。
 */
export async function saveTextFile(
  notify: (message: string) => void,
  {
    filename,
    content,
    mime,
    dialogTitle,
    nativeSuccess,
    webSuccess,
    failure,
  }: SaveTextFileOptions,
): Promise<boolean> {
  try {
    await exportFile(filename, content, mime, dialogTitle);
    notify(Capacitor.isNativePlatform() ? nativeSuccess : webSuccess);
    return true;
  } catch (error) {
    if (isCancelError(error)) return false;
    if (isShareBusyError(error)) {
      notify('上一次分享还没结束，请稍后再试');
      return false;
    }
    notify(failure);
    return false;
  }
}
