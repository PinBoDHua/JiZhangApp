import { useEffect, useLayoutEffect } from 'react';

/** SSR 下 useLayoutEffect 会告警，服务端渲染时退回 useEffect。 */
export const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
