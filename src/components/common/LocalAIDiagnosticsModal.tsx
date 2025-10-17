import React, { useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-hot-toast';

type LocalAIDetails = {
  hasPrompt: boolean;
  secure: boolean;
  protocol: string;
  online: boolean;
  userAgent: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  details?: LocalAIDetails;
};

/**
 * LocalAIDiagnosticsModal
 * An accessible help/diagnostics dialog explaining Local AI (window.ai) and how to enable it.
 * Replace any alert()-based help with this polished UI.
 */
const LocalAIDiagnosticsModal: React.FC<Props> = ({ open, onClose, details }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Build a stable diagnostics text block for clipboard, based on provided details or live probe
  const diagnosticsText = useMemo(() => {
    const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
    const hasPrompt =
      typeof details?.hasPrompt === 'boolean'
        ? details.hasPrompt
        : typeof anyWin?.ai?.prompt === 'function';
    const secure =
      typeof details?.secure === 'boolean'
        ? details.secure
        : (typeof anyWin?.isSecureContext === 'boolean' ? anyWin.isSecureContext : false);
    const protocol =
      typeof details?.protocol === 'string'
        ? details.protocol
        : (typeof window !== 'undefined' ? window.location?.protocol || '' : '');
    const online =
      typeof details?.online === 'boolean'
        ? details.online
        : (typeof navigator !== 'undefined' ? navigator.onLine : false);
    const ua =
      typeof details?.userAgent === 'string'
        ? details.userAgent
        : (typeof navigator !== 'undefined' ? navigator.userAgent : '');

    return [
      `Local AI prompt(): ${hasPrompt}`,
      `Secure context: ${secure} (${protocol})`,
      `navigator.onLine: ${online}`,
      `UserAgent: ${ua}`,
    ].join('\n');
  }, [details]);

  useEffect(() => {
    if (!open) return;
    // Move focus to Close for keyboard users; restore on unmount
    const opener = (document.activeElement as HTMLElement | null) ?? null;
    const to = setTimeout(() => closeRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(to);
      document.removeEventListener('keydown', onKeyDown);
      // restore focus
      setTimeout(() => opener?.focus(), 0);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-ai-modal-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mx-4 w-full max-w-2xl rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 id="local-ai-modal-title" className="text-base font-semibold text-gray-900">
            Local AI help
          </h3>
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

        <div className="max-h-[70vh] overflow-auto px-6 py-5 text-[15px] leading-7 text-gray-800 space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
            Your browser is offline and Local AI (on-device) is currently unavailable. This feature runs
            a small model directly in Chrome to generate a form without internet access.
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold text-gray-900">How to enable Local AI in Chrome Dev/Canary</h4>
            <ol className="list-decimal pl-6 space-y-1 text-sm text-gray-800">
              <li>Use Google Chrome Dev or Canary (recent build).</li>
              <li>
                Open <code className="rounded bg-gray-100 px-1 py-0.5">chrome://flags</code> and enable:
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li>Prompt API for Gemini Nano</li>
                  <li>Optimization Guide On Device Model</li>
                </ul>
              </li>
              <li>Relaunch Chrome.</li>
              <li>Wait a few minutes for the on-device model to download.</li>
              <li>
                Verify at <code className="rounded bg-gray-100 px-1 py-0.5">chrome://optimization-guide-internals</code> under “Models”.
              </li>
              <li>Refresh this page; the status should change to “🧠 Local AI Active”.</li>
            </ol>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold text-gray-900">Diagnostics</h4>
            <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-[13px] leading-6 text-gray-700 ring-1 ring-gray-200">
{diagnosticsText}
            </pre>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(diagnosticsText);
                    toast.success('Diagnostics copied');
                  } catch {
                    toast.error('Copy failed');
                  }
                }}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                title="Copy diagnostics to clipboard"
              >
                Copy diagnostics
              </button>
              <a
                href="https://web.dev/articles/ai-on-device-prompting"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                title="Open Chrome on-device AI docs"
              >
                View setup guide ↗
              </a>
            </div>
          </div>

          <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-100">
            Note: When offline, only text prompts are supported. Image or document inputs require cloud AI.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
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

export default LocalAIDiagnosticsModal;