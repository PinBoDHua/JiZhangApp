import { useState } from 'react';

/**
 * 判断表单相对“打开时的初始值”是否已被修改。
 *
 * 只用于拦截误关闭（点遮罩、下滑、Esc），因此用 JSON 比较足够：
 * 这些草稿都是几十字节的普通对象，每次渲染序列化一次的成本可以忽略。
 */
export function useIsDirty(value: unknown): boolean {
  const [initialText] = useState(() => JSON.stringify(value));
  return JSON.stringify(value) !== initialText;
}
