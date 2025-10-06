import React, { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// TS note: react-markdown type defs can be strict across versions; use a local alias to avoid JSX prop typing issues.
const Markdown: any = ReactMarkdown;

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

        <div className="max-h-[70vh] overflow-auto px-6 py-5 text-[15px] leading-7 text-gray-800">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props: any) => <h1 className="text-xl font-bold text-gray-900 mb-3" {...props} />,
              h2: (props: any) => <h2 className="mt-4 mb-2 text-lg font-semibold text-gray-900" {...props} />,
              h3: (props: any) => <h3 className="mt-3 mb-2 text-base font-semibold text-gray-900" {...props} />,
              p: (props: any) => <p className="mb-3" {...props} />,
              ul: (props: any) => <ul className="mb-3 list-disc pl-5 space-y-1" {...props} />,
              ol: (props: any) => <ol className="mb-3 list-decimal pl-5 space-y-1" {...props} />,
              li: (props: any) => <li className="marker:text-gray-400" {...props} />,
              strong: (props: any) => <strong className="font-semibold text-gray-900" {...props} />,
              em: (props: any) => <em className="italic" {...props} />,
              a: (props: any) => <a className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer" {...props} />,
              hr: (props: any) => <hr className="my-4 border-gray-200" {...props} />,
              blockquote: (props: any) => (
                <blockquote className="mb-3 border-l-4 border-gray-300 pl-3 italic text-gray-700" {...props} />
              ),
            }}
          >
            {text}
          </Markdown>
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