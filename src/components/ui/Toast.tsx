import React, { useEffect } from 'react';
import Card from './Card';

type ToastProps = {
  title: string;
  message: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  // Optional override; if not provided, defaults to 12s
  autoCloseMs?: number;
  // Optional ARIA role, defaults to 'status'
  role?: 'status' | 'alert';
};

/**
 * Reusable toast card for contextual notifications.
 * - Visual: amber-themed informational card
 * - Placement: handled by the toast host (e.g., react-hot-toast) - typically top-right
 * - Behavior: auto-dismisses after autoCloseMs (default 12s), with manual dismiss (X)
 */
const Toast: React.FC<ToastProps> = ({
  title,
  message,
  icon,
  onClose,
  autoCloseMs = 12000,
  role = 'status',
}) => {
  useEffect(() => {
    if (!autoCloseMs || autoCloseMs <= 0) return;
    const t = window.setTimeout(() => {
      try {
        onClose?.();
      } catch {}
    }, autoCloseMs);
    return () => window.clearTimeout(t);
  }, [autoCloseMs, onClose]);

  return (
    <div className="pointer-events-auto">
      <Card className="flex w-[320px] items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-md ring-1 ring-amber-100">
        {icon ? (
          <div className="mt-0.5 text-amber-700" aria-hidden>
            {icon}
          </div>
        ) : null}
        <div
          className="min-w-0 flex-1"
          role={role}
          aria-live={role === 'alert' ? 'assertive' : 'polite'}
        >
          <div className="text-sm font-semibold text-amber-900">{title}</div>
          <p className="mt-0.5 text-xs leading-5 text-amber-900/90">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-amber-900/70 hover:bg-amber-100"
          aria-label="Dismiss notification"
          title="Dismiss"
        >
          ×
        </button>
      </Card>
    </div>
  );
};

export default Toast;