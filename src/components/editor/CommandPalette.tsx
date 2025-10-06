import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (command: string) => void;
  suggestions?: string[];
  isLoading?: boolean;
  error?: string | null;
};

const DEFAULT_SUGGESTIONS = [
  'Make the form more professional',
  'Make the form more casual and friendly',
  'Simplify the language of all questions',
  'Add 5 more relevant questions',
  'Remove all sections',
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onSubmit, suggestions = DEFAULT_SUGGESTIONS, isLoading = false, error = null }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setValue('');
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = (cmd?: string) => {
    const toSend = (cmd ?? value).trim();
    if (!toSend || isLoading) return;
    onSubmit(toSend);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:pt-20"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-palette-title"
      onClick={onClose}
      data-type-palette="true"
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl ring-1 ring-black/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="ai-palette-title" className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            AI Actions
          </h2>
          <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close AI Actions">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Or, type your own refactoring command..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isLoading}
            />
            <button
              type="button"
              className="btn-brand"
              onClick={() => handleSubmit()}
              disabled={isLoading || value.trim().length === 0}
              title="Apply custom command"
            >
              {isLoading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Applying...</span> : 'Apply'}
            </button>
          </div>

          {error && <div className="rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Suggested actions</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {suggestions.map((s, idx) => (
                <button
                  key={`${idx}-${s}`}
                  type="button"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
                  onClick={() => handleSubmit(s)}
                  disabled={isLoading}
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-slate-500">
          <span>Tip: Press Enter to apply the typed command.</span>
          <span className="hidden sm:block">Esc to close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;