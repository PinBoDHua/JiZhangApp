import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ScreenBoundaryProps {
  children: ReactNode;
  /** 页面名，仅用于日志与提示语 */
  screen: string;
}

interface ScreenBoundaryState {
  error: Error | null;
}

/**
 * 单个标签页的错误边界。
 *
 * 顶层 ErrorBoundary 只能保住「不白屏」，一旦某一页渲染抛错，整个应用会切到崩溃页，
 * 用户连切换标签页自救的机会都没有。这里把边界下移到每页一层：
 * - 单页异常只影响该页，底部导航与其它页仍可用；
 * - 切走再切回会重建组件（App 用 key={tab} 挂载），错误状态自然清空；
 * - 重试按钮就地重建子树，适合一次性/竞态类异常。
 */
export class ScreenBoundary extends Component<ScreenBoundaryProps, ScreenBoundaryState> {
  state: ScreenBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ScreenBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`「${this.props.screen}」渲染失败`, error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="screen-error" role="alert">
        <h1>「{this.props.screen}」没能显示出来</h1>
        <p>数据仍在，其它页面也可以正常使用。可以先重试，或者切到别的标签页再回来。</p>
        <p className="crash-detail">{error.message}</p>
        <div className="crash-actions">
          <button type="button" className="primary-button" onClick={this.handleRetry}>
            重试
          </button>
        </div>
      </div>
    );
  }
}
