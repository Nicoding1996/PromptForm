import React, { useEffect, useMemo, useState } from 'react';
import type { ResultPage } from '../FormRenderer';
import { distributeEvenly } from './outcomesUtils';

type Range = { from: number; to: number };

type Props = {
  open: boolean;
  oldMax: number;
  newMax: number;
  pages: ResultPage[];
  onClose: () => void;
  onApply: (updatedPages: ResultPage[]) => void;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const int = (n: number) => (Number.isFinite(n) ? Math.floor(n) : 0);

const OutcomeRangesAssistant: React.FC<Props> = ({ open, oldMax, newMax, pages, onClose, onApply }) => {
  // Suggested ranges based on proportional mapping from oldMax -> newMax
  const suggested: Range[] = useMemo(() => {
    const safeOld = oldMax > 0 ? oldMax : pages.reduce((acc, p) => Math.max(acc, p?.scoreRange?.to ?? 0), 0);
    const safeNew = newMax > 0 ? newMax : safeOld;

    // Proportionally map previous ranges (no auto-shift). Users can click "Auto-fix Ranges".
    const mapped = pages.map((p) => {
      const from = int(p?.scoreRange?.from ?? 0);
      const to = int(p?.scoreRange?.to ?? 0);
      if (safeOld <= 0) {
        return { from: clamp(from, 0, safeNew), to: clamp(to, 0, safeNew) };
      }
      const nFrom = clamp(Math.round((from / safeOld) * safeNew), 0, safeNew);
      const nTo = clamp(Math.round((to / safeOld) * safeNew), 0, safeNew);
      const ordered = nFrom <= nTo ? { from: nFrom, to: nTo } : { from: nTo, to: nFrom };
      return ordered;
    });

    return mapped;
  }, [pages, oldMax, newMax]);

  // Draft editable state
  const [draft, setDraft] = useState<Range[]>(suggested);

  useEffect(() => {
    // Reset when modal re-opens or inputs change meaningfully
    if (open) {
      setDraft(suggested);
    }
  }, [open, suggested]);

  // Per-row validation against neighbors and bounds
  const rowIssues = useMemo(() => {
    return draft.map((r, i) => {
      const msgs: string[] = [];
      const prev = draft[i - 1];
      const next = draft[i + 1];

      if (!Number.isFinite(r.from) || !Number.isFinite(r.to)) {
        msgs.push('Enter numbers only.');
      }
      if (r.from > r.to) {
        msgs.push('From cannot be greater than To.');
      }
      if (r.from < 0) msgs.push('From must be ≥ 0.');
      if (r.to > newMax) msgs.push(`To must be ≤ ${newMax}.`);

      if (prev) {
        if (r.from <= prev.to) msgs.push(`Overlaps previous (prev to = ${prev.to}).`);
        if (r.from > prev.to + 1) msgs.push(`Gap after previous (prev to = ${prev.to}).`);
      }
      if (next) {
        if (r.to >= next.from) msgs.push('Overlaps next.');
        if (r.to < next.from - 1) {
          // do nothing here; the next row will report a gap from its perspective
        }
      }

      return { hasError: msgs.length > 0, messages: msgs };
    });
  }, [draft, newMax]);

  const anyErrors = rowIssues.some((ri) => ri.hasError);

  // Overall coverage issues (start/end gaps)
  const overallIssues = useMemo(() => {
    const msgs: string[] = [];
    if (draft.length > 0) {
      if (draft[0].from > 0) msgs.push(`Coverage gap at start: first "from" is ${draft[0].from} (should be 0).`);
      const last = draft[draft.length - 1];
      if (last.to < newMax) msgs.push(`Coverage gap at end: last "to" is ${last.to} (should be ${newMax}).`);
    }
    return msgs;
  }, [draft, newMax]);

  const updateDraft = (index: number, patch: Partial<Range>) => {
    setDraft((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mx-4 w-full max-w-4xl rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">Review & Update Outcome Ranges</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-3 text-sm text-gray-700 flex items-center gap-3 flex-wrap">
          <span className="rounded-md bg-gray-100 px-2 py-1">Old max score: <strong>{oldMax}</strong></span>
          <span className="rounded-md bg-gray-100 px-2 py-1">New max score: <strong>{newMax}</strong></span>

          <button
            type="button"
            onClick={() => setDraft(distributeEvenly(newMax, pages.length))}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            title="Fix ranges to contiguous 0..max without gaps/overlaps"
          >
            Auto-fix Ranges
          </button>
        </div>

        {overallIssues.length > 0 && (
          <div className="mx-5 -mt-1 mb-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <ul className="list-disc pl-5 space-y-1">
              {overallIssues.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-[70vh] overflow-auto px-5 pb-2">
          <div className="grid grid-cols-1 gap-3">
            {pages.map((p, i) => {
              const curFrom = int(p?.scoreRange?.from ?? 0);
              const curTo = int(p?.scoreRange?.to ?? 0);
              const r = draft[i];
              const issues = rowIssues[i];
              return (
                <div key={`range-row-${i}`} className="rounded-md border border-gray-200 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{p.title || `Outcome ${i + 1}`}</div>
                      <div className="text-xs text-gray-600">
                        Current: {curFrom} - {curTo}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">From</label>
                      <input
                        type="number"
                        min={0}
                        max={newMax}
                        value={r.from}
                        onChange={(e) => updateDraft(i, { from: clamp(int(Number(e.target.value)), 0, newMax) })}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <label className="text-xs text-gray-600">To</label>
                      <input
                        type="number"
                        min={0}
                        max={newMax}
                        value={r.to}
                        onChange={(e) => updateDraft(i, { to: clamp(int(Number(e.target.value)), 0, newMax) })}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>

                  {issues.hasError ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-red-700 space-y-1">
                      {issues.messages.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-green-700">Looks good.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={anyErrors}
            onClick={() => {
              const updated = pages.map((p, i) => ({
                ...p,
                scoreRange: { from: draft[i].from, to: draft[i].to },
              }));
              onApply(updated);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
              anyErrors ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
            title={anyErrors ? 'Fix validation issues to proceed' : 'Apply updated ranges'}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutcomeRangesAssistant;