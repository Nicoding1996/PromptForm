import React, { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';

type Props = {
  text: string;
  onClose: () => void;
  title?: string;
};

const ReportModal: React.FC<Props> = ({ text, onClose, title = 'AI-Powered Summary Report' }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Move focus to close on open; restore focus to opener on unmount
  useEffect(() => {
    const opener = (document.activeElement as HTMLElement | null) ?? null;
    setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      setTimeout(() => opener?.focus(), 0);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mx-4 w-full max-w-3xl rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 id="report-modal-title" className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4">
          <div className="whitespace-pre-wrap text-sm text-gray-900">
            {text}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast.success('Report copied to clipboard!');
              } catch {
                toast.error('Copy failed. Please try again.');
              }
            }}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            title="Copy report to clipboard"
            aria-label="Copy report to clipboard"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;