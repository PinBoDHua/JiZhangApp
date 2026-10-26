import { useCallback, useEffect, useState } from 'react';

export interface ToastState {
  message: string;
  id: number;
  actionLabel?: string;
  onAction?: () => void;
}

/** 顶部轻提示：普通提示 2.6 秒，带「撤销」的提示停留 6 秒 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((message: string) => {
    setToast({ message, id: Date.now() });
  }, []);

  const notifyWithAction = useCallback(
    (message: string, actionLabel: string, onAction: () => void) => {
      setToast({ message, id: Date.now(), actionLabel, onAction });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.actionLabel ? 6000 : 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return { toast, setToast, notify, notifyWithAction };
}
