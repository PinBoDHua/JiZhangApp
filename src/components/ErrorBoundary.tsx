import { Component, type ErrorInfo, type ReactNode } from 'react';
import { flushActiveWrites, readRawStorageSnapshot } from '../storage';
import { downloadFile, todayISO } from '../utils';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 渲染异常时不让应用白屏：给出重试入口，并允许把本机数据原样导出。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('界面渲染失败', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleExport = (): void => {
    // 先把排队中的写入落盘，导出的才是用户最后一次编辑后的数据
    flushActiveWrites();
    downloadFile(
      `工时账本-原始数据-${todayISO()}.json`,
      JSON.stringify(readRawStorageSnapshot(), null, 2),
      'application/json',
    );
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen" role="alert">
        <h1>页面出了点问题</h1>
        <p>
          记录仍然保存在本机，没有丢失。可以先导出原始数据留存，再刷新页面继续使用。
        </p>
        <p className="crash-detail">{error.message}</p>
        <div className="crash-actions">
          <button type="button" className="primary-button" onClick={this.handleReload}>
            刷新页面
          </button>
          <button type="button" className="ghost-button" onClick={this.handleExport}>
            导出原始数据
          </button>
        </div>
      </div>
    );
  }
}
