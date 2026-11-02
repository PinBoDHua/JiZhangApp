import { describe, expect, it } from 'vitest';
import { isCancelError, isShareBusyError } from './app/fileExport';

describe('isCancelError', () => {
  it('recognises the plugin cancel message on Android and iOS', () => {
    expect(isCancelError(new Error('Share canceled'))).toBe(true);
    expect(isCancelError(new Error('Share cancelled'))).toBe(true);
    expect(isCancelError('Share canceled')).toBe(true);
  });

  it('does not swallow real failures that merely mention cancel', () => {
    // 文件名里带 cancel 时，写盘失败的报错不能被当成“用户取消”
    expect(
      isCancelError(new Error('Unable to write file at /cache/cancel-备份.json')),
    ).toBe(false);
    expect(isCancelError(new Error('Share failed'))).toBe(false);
    expect(isCancelError(new Error(''))).toBe(false);
  });
});

describe('isShareBusyError', () => {
  it('treats a share already in progress as a retry, not a failure', () => {
    expect(
      isShareBusyError(new Error("Can't share while sharing is in progress")),
    ).toBe(true);
    expect(isShareBusyError(new Error('Share canceled'))).toBe(false);
    expect(isShareBusyError(new Error('Unable to write file'))).toBe(false);
  });
});
