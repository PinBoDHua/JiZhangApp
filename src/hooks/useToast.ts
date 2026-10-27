import { useCallback, useEffect, useState } from 'react';

export interface ToastState {
  message: string;
  id: number;
  actionLabel?: string;
  onAction?: () => void;
  leaving?: boolean;
}

let nextToastId = 0;

/** 轻提示：普通提示 2.6 秒，带「撤销」的提示停留 6 秒，退场动画结束后才卸载。 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const dismissToast = useCallback(() => {
    setToast((current) =>
      current && !current.leaving ? { ...current, leaving: true } : current,
    );
  }, []);

  const notify = useCallback((message: string) => {
    nextToastId += 1;
    setToast({ message, id: nextToastId });
  }, []);

  const notifyWithAction = useCallback(
    (message: string, actionLabel: string, onAction: () => void) => {
      nextToastId += 1;
      setToast({ message, id: nextToastId, actionLabel, onAction });
    },
    [],
  );

  useEffect(() => {
    if (!toast || toast.leaving) return;
    const timer = window.setTimeout(dismissToast, toast.actionLabel ? 6000 : 2600);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  useEffect(() => {
    if (!toast?.leaving) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.leaving ? null : current));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return { toast, dismissToast, notify, notifyWithAction };
}
