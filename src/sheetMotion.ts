import { createContext } from 'react';

/**
 * App 层统一控制浮层退出：关闭时先播放退场动画，再真正卸载。
 * 用 context 传递，避免每个业务 sheet 都要多接一个 closing 属性。
 */
export const SheetMotionContext = createContext(false);
