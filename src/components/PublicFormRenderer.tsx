import React, { useMemo, useRef, useState } from 'react';
import type { FormData, FormField } from './FormRenderer';

const baseInputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';
const baseLabelClass = 'text-sm font-medium text-gray-700';

// Helpers for deterministic grading of text and choice answers
const normalize = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const toArray = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : []);
const setFrom = (arr: string[]) => new Set(arr.map(normalize));
const setsEqual = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

type Props = {
  formData: FormData | null;
  formId: string;
};

// Live range control with reactive value display
const LiveRange: React.FC<{
  id: string;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
  required?: boolean;
  className?: string;
}> = ({ id, name, min, max, defaultValue, required, className }) => {
  const [value, setValue] = useState<number>(defaultValue);
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        id={id}
        name={name}
        min={min}
        max={max}
        value={value}
        required={required}
        onChange={(e) => setValue(Number(e.target.value))}
        onInput={(e) => setValue(Number((e.target as HTMLInputElement).value))}
        className={className}
      />
      <output className="min-w-[40px] text-center text-sm font-semibold text-gray-700">{value}</output>
    </div>
  );
};
const PublicFormRenderer: React.FC<Props> = ({ formData, formId }) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [lastMaxScore, setLastMaxScore] = useState<number | null>(null);

  // Wizard state
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [allAnswers, setAllAnswers] = useState<Record<string, any>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const actionBase = useMemo(() => {
    return (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3001';
  }, []);

  if (!formData) return null;

  // Partition fields into sections using explicit "section" markers.
  const rawFields = formData.fields ?? [];
  const submitFields = rawFields.filter((f) => f.type === 'submit');
  const nonSubmitFields = rawFields.filter((f) => f.type !== 'submit');

  const sections = useMemo(() => {
    const out: { title: string; fields: FormField[] }[] = [];
    let current: { title: string; fields: FormField[] } = {
      title: formData.title || 'Section',
      fields: [],
    };
    for (const f of rawFields) {
      if (f.type === 'section') {
        if (current.fields.length > 0) out.push(current);
        current = { title: f.label || 'Section', fields: [] };
      } else if (f.type !== 'submit') {
        current.fields.push(f);
      }
    }
    if (current.fields.length > 0) out.push(current);
    if (out.length === 0) {
      out.push({ title: formData.title || 'Form', fields: nonSubmitFields });
    }
    return out;
  }, [formData, rawFields, nonSubmitFields]);

  const totalSections = sections.length;
  const currentSection = sections[Math.max(0, Math.min(currentSectionIndex, totalSections - 1))];
  const submitLabel = useMemo(() => submitFields[0]?.label || 'Submit', [submitFields]);

  // Merge helper (one-level deep for nested radioGrid objects)
  const mergePayload = (a: Record<string, any>, b: Record<string, any>) => {
    const out: Record<string, any> = { ...a };
    for (const k of Object.keys(b)) {
      const av = out[k];
      const bv = b[k];
      if (
        av &&
        typeof av === 'object' &&
        !Array.isArray(av) &&
        bv &&
        typeof bv === 'object' &&
        !Array.isArray(bv)
      ) {
        out[k] = { ...av, ...bv };
      } else {
        out[k] = bv;
      }
    }
    return out;
  };

  // Collect only the current section's answers from the form DOM
  const collectCurrentSectionAnswers = (): Record<string, any> => {
    const payload: Record<string, any> = {};
    const formEl = formRef.current!;
    const fd = new FormData(formEl);

    // Convert FormData to JSON payload; combine duplicate keys into arrays
    for (const [key, value] of fd.entries()) {
      if (key in payload) {
        const prev = payload[key];
        payload[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
      } else {
        payload[key] = value;
      }
    }

    // Post-process radioGrid only for fields in the current section
    for (const f of currentSection.fields) {
      if (f.type !== 'radioGrid') continue;
      const rows = (f as any).rows ?? [];
      const cols = (f as any).columns ?? [];
      const gridObj: Record<string, string | null> = {};
      rows.forEach((rowLabel: string, rIdx: number) => {
        const rowName = `${f.name}[${rIdx}]`;
        const raw = fd.get(rowName);

        if (Object.prototype.hasOwnProperty.call(payload, rowName)) {
          delete payload[rowName];
        }

        let selected: string | null = null;
        if (raw != null && String(raw).length > 0) {
          const cIdx = Number(raw);
          if (Number.isFinite(cIdx) && cIdx >= 0 && cIdx < cols.length) {
            const c = cols[cIdx];
            selected = typeof c === 'string' ? c : (c?.label ?? null);
          }
        }
        gridObj[rowLabel] = selected;
        payload[`${f.name}.${rowLabel}`] = selected;
      });
      payload[f.name] = { ...(payload[f.name] || {}), ...gridObj };
    }

    return payload;
  };

  const handleNext = () => {
    setError(null);
    if (!formRef.current?.reportValidity()) return;
    const pagePayload = collectCurrentSectionAnswers();
    setAllAnswers((prev) => mergePayload(prev, pagePayload));
    setCurrentSectionIndex((i) => Math.min(i + 1, totalSections - 1));
  };

  const handlePrev = () => {
    setError(null);
    setCurrentSectionIndex((i) => Math.max(i - 1, 0));
  };

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError(null);
    if (!formRef.current?.reportValidity()) return;
    setSubmitting(true);
    try {
      // Merge final page answers
      const finalPagePayload = collectCurrentSectionAnswers();
      const payload = mergePayload(allAnswers, finalPagePayload);

      // Quiz scoring (local) if enabled
      let scoreToSend: number | null = null;
      let maxToSend: number | null = null;
      if ((formData as any)?.isQuiz === true) {
        let score = 0;
        let max = 0;

        for (const f of formData.fields ?? []) {
          const pointsRaw = Number((f as any).points ?? 1);
          const points = Number.isFinite(pointsRaw) ? pointsRaw : 1;
          const userVal = payload[f.name];

          // Optional regex support for deterministic grading
          const patternStr = (f as any).answerPattern as string | undefined;
          let regex: RegExp | null = null;
          if (typeof patternStr === 'string' && patternStr.length > 0) {
            try {
              regex = new RegExp(patternStr, 'i');
            } catch {
              regex = null;
            }
          }

          let ok: boolean | null = null; // null = not gradable, don't add to max

          // RadioGrid scoring using selected labels in payload (no direct index available)
          if (f.type === 'radioGrid') {
            const rows = (f as any).rows ?? [];
            const cols = (f as any).columns ?? [];

            const rawPoints: number[] = cols.map((c: any) => {
              if (typeof c === 'string') return NaN;
              const p = Number(c?.points);
              return Number.isFinite(p) ? p : NaN;
            });

            const allMissing = rawPoints.every((p) => !Number.isFinite(p));
            const allEqualFinite =
              rawPoints.every((p) => Number.isFinite(p)) &&
              rawPoints.every((p) => p === rawPoints[0]);

            const fallbackOrdinal = allMissing || allEqualFinite;
            const effectivePoints = (idx: number): number => {
              if (fallbackOrdinal) return idx + 1;
              const p = rawPoints[idx];
              return Number.isFinite(p) ? p : 1;
            };
            const labelOf = (c: any) => (typeof c === 'string' ? c : c?.label ?? '');
            const maxColPts =
              cols.length > 0
                ? Math.max(...cols.map((_: any, i: number) => effectivePoints(i)))
                : 0;

            rows.forEach((rowLabel: string) => {
              max += maxColPts;
              const selectedLabel =
                payload?.[f.name]?.[rowLabel] ?? payload?.[`${f.name}.${rowLabel}`] ?? null;
              if (selectedLabel != null) {
                const idx = cols.findIndex((c: any) => normalize(labelOf(c)) === normalize(selectedLabel));
                if (idx >= 0) {
                  score += effectivePoints(idx);
                }
              }
            });
            continue;
          }

          const norm = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
          if (f.type === 'radio' || f.type === 'select') {
            const correct = (f as any).correctAnswer as string | undefined;
            if (regex) ok = regex.test(String(userVal ?? ''));
            else if (typeof correct === 'string' && correct.length > 0) {
              ok = norm(userVal) === norm(correct);
            }
          } else if (f.type === 'checkbox') {
            const correctRaw = (f as any).correctAnswer;
            if (Array.isArray(correctRaw)) {
              const userSet = setFrom(toArray(userVal));
              const correctSet = setFrom(correctRaw);
              ok = setsEqual(userSet, correctSet);
            } else if (typeof correctRaw === 'string' && correctRaw.length > 0) {
              const userSet = setFrom(toArray(userVal));
              ok = userSet.has(norm(correctRaw));
            }
          } else if (f.type === 'text' || f.type === 'textarea') {
            const correct = (f as any).correctAnswer as string | undefined;
            if (regex) ok = regex.test(String(userVal ?? ''));
            else if (typeof correct === 'string' && correct.length > 0) {
              ok = norm(userVal) === norm(correct);
            }
          }

          if (ok !== null) {
            max += points;
            if (ok) score += points;
          }
        }

        scoreToSend = score;
        maxToSend = max;
        setLastScore(score);
        setLastMaxScore(max);
      } else {
        setLastScore(null);
        setLastMaxScore(null);
      }

      const resp = await fetch(`${actionBase}/submit-response/${formId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          score: scoreToSend,
          maxScore: maxToSend,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail?.message || `Submit failed (${resp.status})`);
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit response.');
    } finally {
      setSubmitting(false);
    }
  };

  const valueFor = (name: string): any => allAnswers[name];

  const renderField = (field: FormField, idx: number) => {
    const required = (field as any).required === true;
    const labelNode = (
      <label className={baseLabelClass} htmlFor={field.name}>
        {field.label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
    );

    // Simple inputs
    if (
      field.type === 'text' ||
      field.type === 'email' ||
      field.type === 'password' ||
      field.type === 'date' ||
      field.type === 'time' ||
      field.type === 'file'
    ) {
      const defaultVal = field.type === 'file' ? undefined : valueFor(field.name) ?? '';
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <input
            type={field.type}
            id={field.name}
            name={field.name}
            className={baseInputClass}
            required={required}
            defaultValue={field.type === 'file' ? undefined : defaultVal}
          />
        </div>
      );
    }

    if (field.type === 'range') {
      const min = (field as any).min ?? 0;
      const max = (field as any).max ?? 10;
      const saved = Number(valueFor(field.name));
      const mid = Math.floor((min + max) / 2);
      const def = Number.isFinite(saved) ? saved : mid;
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <LiveRange
            id={field.name}
            name={field.name}
            min={min}
            max={max}
            defaultValue={def}
            required={required}
            className="h-2 w-full appearance-none rounded-lg bg-gray-200 accent-indigo-600"
          />
        </div>
      );
    }

    if (field.type === 'textarea') {
      const defaultVal = valueFor(field.name) ?? '';
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <textarea
            id={field.name}
            name={field.name}
            rows={4}
            className={baseInputClass}
            required={required}
            defaultValue={defaultVal}
          />
        </div>
      );
    }

    if (field.type === 'radio') {
      const options = field.options ?? [];
      const saved = String(valueFor(field.name) ?? '');
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          <span className={baseLabelClass}>
            {field.label}
            {required ? <span className="ml-1 text-red-600">*</span> : null}
          </span>
          <div className="flex flex-col gap-2">
            {options.map((opt, optIdx) => {
              const optId = `${field.name}-radio-${optIdx}`;
              return (
                <div className="flex items-center gap-2" key={optId}>
                  <input
                    type="radio"
                    id={optId}
                    name={field.name}
                    value={opt}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    required={required && optIdx === 0}
                    defaultChecked={saved ? normalize(saved) === normalize(opt) : false}
                  />
                  <label className="text-sm text-gray-700" htmlFor={optId}>
                    {opt}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (field.type === 'checkbox') {
      const options = field.options ?? [];
      const savedVal = valueFor(field.name);
      const savedSet = new Set(toArray(savedVal).map(normalize));
      if (options.length > 0) {
        return (
          <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
            <span className={baseLabelClass}>
              {field.label}
              {required ? <span className="ml-1 text-red-600">*</span> : null}
            </span>
            <div className="flex flex-col gap-2">
              {options.map((opt, optIdx) => {
                const optId = `${field.name}-check-${optIdx}`;
                return (
                  <label className="flex items-center gap-2 text-sm text-gray-700" key={optId}>
                    <input
                      type="checkbox"
                      id={optId}
                      name={field.name}
                      value={opt}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      defaultChecked={savedSet.has(normalize(opt))}
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      }
      // Single checkbox fallback
      return (
        <label className="flex items-center gap-2 text-sm text-gray-700" key={`${field.name}-${idx}`}>
          <input
            type="checkbox"
            id={field.name}
            name={field.name}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            defaultChecked={!!savedVal}
          />
          <span>{field.label}</span>
        </label>
      );
    }

    if (field.type === 'select') {
      const options = field.options ?? [];
      const saved = String(valueFor(field.name) ?? '');
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <select
            id={field.name}
            name={field.name}
            className={baseInputClass}
            defaultValue={saved || ''}
            required={required}
          >
            <option value="" disabled>
              Select an option
            </option>
            {options.map((opt, optIdx) => (
              <option key={`${field.name}-opt-${optIdx}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'radioGrid') {
      const rows = (field as any).rows ?? [];
      const cols = (field as any).columns ?? [];
      const getSavedForRow = (rowLabel: string): string | null => {
        const nested = allAnswers?.[field.name]?.[rowLabel] ?? null;
        const flat = allAnswers?.[`${field.name}.${rowLabel}`] ?? null;
        return (nested ?? flat) as string | null;
      };
      return (
        <div className="flex flex-col gap-3" key={`${field.name}-${idx}`}>
          <span className={baseLabelClass}>
            {field.label}
            {required ? <span className="ml-1 text-red-600">*</span> : null}
          </span>
          <div className="overflow-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left text-xs font-semibold text-gray-600"></th>
                  {cols.map((col: any, cIdx: number) => {
                    const colLabel = typeof col === 'string' ? col : col?.label ?? '';
                    return (
                      <th key={`${field.name}-col-${cIdx}`} className="p-2 text-xs font-semibold text-gray-600">
                        {colLabel}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row: string, rIdx: number) => {
                  const rowName = `${field.name}[${rIdx}]`;
                  const savedRowLabel = getSavedForRow(row);
                  const savedIdx =
                    savedRowLabel != null
                      ? cols.findIndex((c: any) => normalize(typeof c === 'string' ? c : c?.label ?? '') === normalize(savedRowLabel))
                      : -1;
                  return (
                    <tr key={`${field.name}-row-${rIdx}`} className="border-t border-gray-200">
                      <th scope="row" className="p-2 text-left text-sm font-medium text-gray-700">
                        {row}
                      </th>
                      {cols.map((col: any, cIdx: number) => {
                        const id = `${field.name}-${rIdx}-${cIdx}`;
                        const colLabel = typeof col === 'string' ? col : col?.label ?? '';
                        return (
                          <td key={id} className="p-2 text-center">
                            <input
                              type="radio"
                              id={id}
                              name={rowName}
                              value={String(cIdx)}
                              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              aria-label={`${row} - ${colLabel}`}
                              required={required && cIdx === 0}
                              defaultChecked={savedIdx === cIdx}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Submit is handled by wizard (only on last step)
    return null;
  };

  // Submitted view (outcomes or simple score)
  if (submitted) {
    const pages = (formData as any)?.resultPages as Array<any> | undefined;
    const hasOutcomes = Array.isArray(pages) && pages.length > 0;

    let matched: any = null;
    if ((formData as any)?.isQuiz === true && hasOutcomes && lastScore != null) {
      matched =
        pages.find((p) => {
          const from = Number(p?.scoreRange?.from ?? NaN);
          const to = Number(p?.scoreRange?.to ?? NaN);
          if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
          return lastScore >= from && lastScore <= to;
        }) || null;
    }

    if (matched) {
      return (
        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <h2 className="text-xl font-bold text-gray-900">{matched.title || 'Your Result'}</h2>
            <p className="text-sm text-gray-500">
              Score: {lastScore}
              {lastMaxScore != null ? ` / ${lastMaxScore}` : ''}
            </p>
            <p className="whitespace-pre-wrap text-gray-800">{matched.description || '—'}</p>
          </div>
        </section>
      );
    }

    return (
      <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Thank you for your response!</h2>
          {(formData as any)?.isQuiz === true && lastScore != null && lastMaxScore != null ? (
            <p className="mt-2 text-base font-semibold text-indigo-700">
              You scored {lastScore} out of {lastMaxScore}!
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-600">Your submission has been recorded.</p>
          )}
        </div>
      </section>
    );
  }

  // Wizard UI
  return (
    <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-6">
        <h2 className="block text-xl font-semibold text-gray-900">{formData.title}</h2>
        {formData.description && <p className="mt-1 text-sm text-gray-600">{formData.description}</p>}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900">
          {currentSection?.title || `Section ${currentSectionIndex + 1}`}
        </h3>
        <p className="text-xs text-gray-500">
          Page {currentSectionIndex + 1} of {totalSections}
        </p>
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {(currentSection?.fields ?? []).map((f, idx) => renderField(f, idx))}

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentSectionIndex === 0}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>

          {currentSectionIndex < totalSections - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : submitLabel}
            </button>
          )}
        </div>
      </form>
    </section>
  );
};

export default PublicFormRenderer;