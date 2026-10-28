import { Capacitor } from '@capacitor/core';
import { exportFile } from '../native';

/** 系统分享面板被用户取消时的报错形态各家不同，统一用关键字判断 */
export function isCancelError(error: unknown): boolean {
  return /cancel/i.test(error instanceof Error ? error.message : String(error));
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
    notify(failure);
    return false;
  }
}
