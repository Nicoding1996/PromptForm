import React, { useEffect, useRef } from 'react';

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  message?: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * ConfirmModal
 * Accessible, lightweight confirm dialog used before destructive/overwriting actions.
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Yes, continue',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Focus cancel by default for safer UX
    setTimeout(() => cancelRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      setTimeout(() => prev?.focus(), 0);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      <div className="relative mx-4 w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 id="confirm-modal-title" className="text-base font-semibold text-gray-900">
            {title}
          </h3>
        </div>

        <div className="px-5 py-4 text-sm text-gray-800">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-500"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;