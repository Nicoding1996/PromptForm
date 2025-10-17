import React, { useMemo, useRef, useState } from 'react';
import type { FormData, FormField } from './FormRenderer';
import Card from './ui/Card';
import { calculateResult, type CalcResult } from '../utils/scoring';

const baseInputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[--color-brand-600] focus:outline-none focus:ring-2 focus:ring-[--color-brand-600]';
const baseLabelClass = 'text-sm font-medium text-slate-700';

// Helpers for deterministic grading of text and choice answers
const normalize = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const toArray = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : []);
/* removed unused helpers: setFrom, setsEqual */

type Props = {
  formData: FormData | null;
  formId: string;
  preview?: boolean;
  // Adaptive Theming (optional overrides passed from page)
  themePrimaryColor?: string;
  themeBackgroundColor?: string;
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
  ariaLabelledBy?: string;
}> = ({ id, name, min, max, defaultValue, required, className, ariaLabelledBy }) => {
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
        aria-labelledby={ariaLabelledBy}
      />
      <output className="min-w-[40px] text-center text-sm font-semibold text-gray-700">{value}</output>
    </div>
  );
};
const PublicFormRenderer: React.FC<Props> = ({ formData, formId, preview = false, themePrimaryColor, themeBackgroundColor: _themeBackgroundColor }) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [lastMaxScore, setLastMaxScore] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<CalcResult | null>(null);

  // Guard window to prevent accidental submit when navigating to last section
  const [navBlockUntil, setNavBlockUntil] = useState<number>(0);
  const [navBlockActive, setNavBlockActive] = useState<boolean>(false);

  // Wizard state
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [allAnswers, setAllAnswers] = useState<Record<string, any>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const actionBase = useMemo(() => {
    return (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3001';
  }, []);

  // Theme variables (from props, with sensible defaults)
  const brand = themePrimaryColor || '#4F46E5'; // indigo-600 fallback
  const styleVars = { ['--color-brand-600' as any]: brand } as React.CSSProperties;

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

  const handleNext = (e?: React.MouseEvent<HTMLButtonElement>) => {
    setError(null);

    // If triggered by a click, prevent the click from re-targeting after re-render
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLButtonElement)?.blur();
      } catch {}
    }

    if (!preview && !formRef.current?.reportValidity()) return;

    // Read answers before changing section
    const pagePayload = collectCurrentSectionAnswers();
    setAllAnswers((prev) => mergePayload(prev, pagePayload));

    // Start a short guard window to ignore any accidental submit that may
    // occur immediately after this navigation due to click retargeting
    setNavBlockUntil(Date.now() + 800);
    setNavBlockActive(true);
    setTimeout(() => setNavBlockActive(false), 850);

    // Defer the section change to the next tick so the original click
    // cannot land on the newly rendered submit button
    setTimeout(() => {
      setCurrentSectionIndex((i) => Math.min(i + 1, totalSections - 1));
    }, 0);
  };

  const handlePrev = () => {
    setError(null);
    setCurrentSectionIndex((i) => Math.max(i - 1, 0));
  };

  // Intercept Enter on non-final pages to prevent implicit submit
  const onFormKeyDown: React.KeyboardEventHandler<HTMLFormElement> = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const type = (target as HTMLInputElement)?.type?.toLowerCase?.();
    const isLast = currentSectionIndex >= totalSections - 1;

    // Allow Enter inside textarea for newlines; only advance when not last
    if (!isLast && tag !== 'textarea' && type !== 'submit') {
      e.preventDefault();
      handleNext();
    }
  };


  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    const nativeEv = e.nativeEvent as SubmitEvent;
    const submitter = (nativeEv && (nativeEv as any).submitter) as HTMLElement | null;
    const isLast = currentSectionIndex >= totalSections - 1;

    // If not on the final section, any submit should act as Next (prevent real submit)
    if (!isLast) {
      handleNext();
      return;
    }

    // On the last section: require an explicit click on our own submit button.
    // This avoids retargeted clicks or implicit submits (e.g., Enter on a field).
    if (submitBtnRef.current && submitter && submitter !== submitBtnRef.current) {
      // Ignore implicit/retargeted submit
      return;
    }

    // Also guard right after navigation or while guard is active
    if (navBlockActive || Date.now() < navBlockUntil) {
      e.stopPropagation();
      return;
    }

    setError(null);
    if (!preview && !formRef.current?.reportValidity()) return;
    setSubmitting(true);
    let scoreToSend: number | null = null;
    let maxToSend: number | null = null;
    try {
      // Merge final page answers
      const finalPagePayload = collectCurrentSectionAnswers();
      const payload = mergePayload(allAnswers, finalPagePayload);

      // Central scoring (knowledge or outcome-based)
      try {
        const calcRes = calculateResult(formData as any, payload);
        setLastResult(calcRes as any);
        setLastScore((calcRes as any).score ?? null);
        setLastMaxScore((calcRes as any).maxScore ?? null);
        scoreToSend = (calcRes as any).score ?? null;
        maxToSend = (calcRes as any).maxScore ?? null;
      } catch {
        // Non-fatal: if scoring fails, continue with submission
        setLastResult(null);
      }

      // Use score/maxScore from the calculated result (using local vars set above)

      // In preview mode, simulate success without sending anything to the server.
      if (preview) {
        setSubmitted(true);
        return;
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
    const v = ((field as any)?.validation ?? {}) as any;
    const required = (field as any).required === true || v?.required === true;
    const placeholder = (field as any).placeholder ?? '';
    const helperText = (field as any).helperText as string | undefined;
    const minLength = Number.isFinite(Number(v?.minLength)) ? Number(v?.minLength) : undefined;
    const maxLength = Number.isFinite(Number(v?.maxLength)) ? Number(v?.maxLength) : undefined;
    const pattern = typeof v?.pattern === 'string' && v.pattern !== 'email' ? v.pattern : undefined;
    const labelId = `${field.name}-label`;
    const helperId = helperText ? `${field.name}-help` : undefined;
    const labelNode = (
      <span id={labelId} className={baseLabelClass}>
        {field.label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
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
            aria-labelledby={labelId}
            aria-describedby={helperId}
            placeholder={placeholder || undefined}
            minLength={minLength}
            maxLength={maxLength}
            pattern={pattern}
          />
          {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
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
            className="h-2 w-full appearance-none rounded-lg bg-slate-200 accent-[--color-brand-600]"
            ariaLabelledBy={labelId}
          />
          {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
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
            aria-labelledby={labelId}
            aria-describedby={helperId}
            placeholder={placeholder || undefined}
            minLength={minLength}
            maxLength={maxLength}
          />
          {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
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
                    className="h-4 w-4 border-gray-300 text-[--color-brand-600] focus:ring-[--color-brand-600]"
                    required={required && optIdx === 0}
                    defaultChecked={saved ? normalize(saved) === normalize(opt) : false}
                    aria-describedby={helperId}
                  />
                  <label className="text-sm text-gray-700" htmlFor={optId}>
                    {opt}
                  </label>
                </div>
              );
            })}
          </div>
          {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
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
                      className="h-4 w-4 rounded border-gray-300 text-[--color-brand-600] focus:ring-[--color-brand-600]"
                      defaultChecked={savedSet.has(normalize(opt))}
                      aria-describedby={helperId}
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
            {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
          </div>
        );
      }
      // Single checkbox fallback
      return (
        <div className="flex flex-col gap-1" key={`${field.name}-${idx}`}>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              id={field.name}
              name={field.name}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              defaultChecked={!!savedVal}
              aria-describedby={helperId}
            />
            <span>{field.label}</span>
          </label>
          {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
        </div>
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
            aria-labelledby={labelId}
            aria-describedby={helperId}
          >
            <option value="" disabled>
              {placeholder || 'Select an option'}
            </option>
            {options.map((opt, optIdx) => (
              <option key={`${field.name}-opt-${optIdx}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
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
                              className="h-4 w-4 border-gray-300 text-[--color-brand-600] focus:ring-[--color-brand-600]"
                              aria-label={`${row} - ${colLabel}`}
                              required={required && cIdx === 0}
                              defaultChecked={savedIdx === cIdx}
                              aria-describedby={helperId}
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
          {helperText ? <p id={helperId} className="text-xs text-gray-500">{helperText}</p> : null}
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

    // Outcome-based: show the winning outcome in a clean Card
    if (lastResult && (lastResult as any).type === 'OUTCOME') {
      const outcomeId = (lastResult as any).outcomeId || null;
      const outcomeTitle = (lastResult as any).outcomeTitle || null;

      let matchedPage: any = null;
      if (hasOutcomes) {
        if (outcomeId) {
          matchedPage = pages.find((p) => (p?.outcomeId || '') === outcomeId) || null;
        }
        if (!matchedPage && outcomeTitle) {
          const t = String(outcomeTitle).trim().toLowerCase();
          matchedPage =
            pages.find((p) => String(p?.title || '').trim().toLowerCase() === t) || null;
        }
      }

      const finalTitle = outcomeTitle || matchedPage?.title || 'Your Result';
      const finalDesc = matchedPage?.description || '';

      return (
        <section className="mt-8">
          <Card className="p-6">
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <h2 className="text-xl font-bold text-gray-900">{finalTitle}</h2>
              {finalDesc ? (
                <p className="whitespace-pre-wrap text-gray-800">{finalDesc}</p>
              ) : null}
            </div>
          </Card>
        </section>
      );
    }

    // Map score to result page by range if configured (for knowledge or outcome quizzes)
    let matched: any = null;
    if (hasOutcomes && lastScore != null) {
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
        <section className="mt-8">
          <Card className="p-6">
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <h2 className="text-xl font-bold text-gray-900">{matched.title || 'Your Result'}</h2>
              <p className="text-sm text-gray-500">
                Score: {lastScore}
                {lastMaxScore != null ? ` / ${lastMaxScore}` : ''}
              </p>
              <p className="whitespace-pre-wrap text-gray-800">{matched.description || '—'}</p>
            </div>
          </Card>
        </section>
      );
    }

    // Default Thank You
    return (
      <section className="mt-8">
        <Card className="p-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-900">Thank you for your response!</h2>
            {lastScore != null && lastMaxScore != null ? (
              <p className="mt-2 text-base font-semibold" style={{ color: brand }}>
                You scored {lastScore} out of {lastMaxScore}!
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-600">Your submission has been recorded.</p>
            )}
          </div>
        </Card>
      </section>
    );
  }

  // Wizard UI
  return (
    <>
      {preview && (
        <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900 flex items-center justify-between">
          <div>
            <strong className="font-semibold">Preview mode</strong>
            <span className="ml-2 text-gray-700">You are viewing a preview. Submissions are simulated and not saved.</span>
          </div>
          <a
            href={window.location.pathname}
            className="rounded-md bg-white px-3 py-1 text-sm font-medium text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-50"
          >
            Exit Preview
          </a>
        </div>
      )}
      <section className="mt-8 card p-6" style={styleVars}>
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

        <form ref={formRef} onSubmit={onSubmit} onKeyDown={onFormKeyDown} className="space-y-4">
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
                onClick={(e) => handleNext(e)}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm focus-visible:ring-2 focus-visible:ring-[--color-brand-600] focus-visible:ring-offset-2"
                style={{ backgroundColor: brand }}
              >
                Next
              </button>
            ) : (
              <button
                ref={submitBtnRef}
                type="submit"
                disabled={submitting || navBlockActive}
                style={{ pointerEvents: navBlockActive ? 'none' : undefined, backgroundColor: brand }}
                className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-[--color-brand-600] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                title={preview ? 'This submit is simulated in preview mode' : ''}
              >
                {submitting ? 'Submitting...' : submitLabel}
              </button>
            )}
          </div>
        </form>
      </section>
    </>
  );
};

export default PublicFormRenderer;