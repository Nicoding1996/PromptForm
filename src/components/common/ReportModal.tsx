import React from 'react';

type Props = {
  text: string;
  onClose: () => void;
  title?: string;
};

const ReportModal: React.FC<Props> = ({ text, onClose, title = 'AI-Powered Summary Report' }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mx-4 w-full max-w-3xl rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            aria-label="Close"
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
            onClick={() => navigator.clipboard.writeText(text).catch(() => {})}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            title="Copy report to clipboard"
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