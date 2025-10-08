import React from 'react';
import { X, Check, Palette } from 'lucide-react';

export type ThemePreset = {
  name: 'Indigo' | 'Slate' | 'Rose' | 'Amber' | 'Emerald' | 'Sky';
  primary: string;
  background: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  { name: 'Indigo',  primary: '#6366F1', background: '#E0E7FF' },
  { name: 'Slate',   primary: '#475569', background: '#E2E8F0' },
  { name: 'Rose',    primary: '#F43F5E', background: '#FFE4E6' },
  { name: 'Amber',   primary: '#F59E0B', background: '#FEF3C7' },
  { name: 'Emerald', primary: '#10B981', background: '#D1FAE5' },
  { name: 'Sky',     primary: '#0EA5E9', background: '#E0F2FE' },
];

type Props = {
  open: boolean;
  currentName?: ThemePreset['name'] | null;
  onClose: () => void;
  onSelect: (choice: ThemePreset) => void;
};

const StylePanel: React.FC<Props> = ({ open, currentName, onClose, onSelect }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="style-panel-title"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl ring-1 ring-gray-200"
        role="document"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 id="style-panel-title" className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
            <Palette className="h-5 w-5 text-indigo-600" />
            Style
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100"
            aria-label="Close style panel"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-3 text-sm text-gray-600">
            Pick a curated theme. This will update the live form's accent color and background, and the dashboard thumbnail.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {THEME_PRESETS.map((t) => {
              const isActive = t.name === (currentName || null);
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => onSelect(t)}
                  className={`group relative overflow-hidden rounded-lg border px-3 pb-3 pt-20 text-left shadow-sm transition
                    ${isActive ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200 hover:border-indigo-300'}
                  `}
                  aria-pressed={isActive}
                  title={`Apply ${t.name} theme`}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${t.background} 0%, #FFFFFF 70%)`,
                    }}
                    aria-hidden="true"
                  />
                  <div className="absolute left-0 right-0 top-0 h-10" style={{ backgroundColor: t.primary }} />
                  <div className="relative z-10 mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 rounded-full ring-2 ring-white shadow"
                        style={{ backgroundColor: t.primary }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                    </div>
                    {isActive && (
                      <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                        <Check className="mr-1 h-3.5 w-3.5" /> Active
                      </span>
                    )}
                  </div>
                  <div className="relative z-10 mt-2 text-[11px] text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-white/80 px-1.5 py-0.5 ring-1 ring-gray-200">
                        Primary: {t.primary}
                      </span>
                      <span className="rounded-md bg-white/80 px-1.5 py-0.5 ring-1 ring-gray-200">
                        Background: {t.background}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default StylePanel;