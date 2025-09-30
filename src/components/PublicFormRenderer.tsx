import React, { useMemo, useState } from 'react';
import type { FormData, FormField } from './FormRenderer';

const baseInputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';
const baseLabelClass = 'text-sm font-medium text-gray-700';

type Props = {
  formData: FormData | null;
  formId: string;
};

const PublicFormRenderer: React.FC<Props> = ({ formData, formId }) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [lastMaxScore, setLastMaxScore] = useState<number | null>(null);

  const actionBase = useMemo(() => {
    return (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3001';
  }, []);

  if (!formData) return null;

  const rawFields = formData.fields ?? [];
  const submitFields = rawFields.filter((f) => f.type === 'submit');
  const nonSubmitFields = rawFields.filter((f) => f.type !== 'submit');
  const fields = [...nonSubmitFields, ...submitFields];

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const formEl = e.currentTarget;
      const fd = new FormData(formEl);
  
      // Convert FormData to JSON payload; combine duplicate keys into arrays
      const payload: Record<string, any> = {};
      for (const [key, value] of fd.entries()) {
        if (key in payload) {
          const prev = payload[key];
          if (Array.isArray(prev)) payload[key] = [...prev, value];
          else payload[key] = [prev, value];
        } else {
          payload[key] = value;
        }
      }
  
      // Quiz scoring (local) if enabled
      let scoreToSend: number | null = null;
      let maxToSend: number | null = null;
      if ((formData as any)?.isQuiz === true) {
        let score = 0;
        let max = 0;
        const eligible = new Set<FormField['type']>(['radio', 'checkbox', 'select']);
        for (const f of formData.fields ?? []) {
          if (!eligible.has(f.type)) continue;
          const correct = (f as any).correctAnswer as string | undefined;
          if (!correct || !correct.length) continue;
          const points = Number((f as any).points ?? 1);
          const userVal = payload[f.name];
          let ok = false;
          if (Array.isArray(userVal)) {
            ok = (userVal as any[]).map(String).includes(String(correct));
          } else {
            ok = String(userVal ?? '') === String(correct);
          }
          max += Number.isFinite(points) ? points : 1;
          if (ok) score += Number.isFinite(points) ? points : 1;
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
      // Optionally clear inputs
      // formEl.reset();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit response.');
    } finally {
      setSubmitting(false);
    }
  };

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
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <input
            type={field.type}
            id={field.name}
            name={field.name}
            className={baseInputClass}
            required={required}
          />
        </div>
      );
    }

    if (field.type === 'range') {
      const min = (field as any).min ?? 0;
      const max = (field as any).max ?? 10;
      const mid = Math.floor((min + max) / 2);
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <div className="flex items-center gap-4">
            <input
              type="range"
              id={field.name}
              name={field.name}
              min={min}
              max={max}
              defaultValue={mid}
              className="h-2 w-full appearance-none rounded-lg bg-gray-200 accent-indigo-600"
            />
            <output className="min-w-[40px] text-center text-sm font-semibold text-gray-700">{mid}</output>
          </div>
        </div>
      );
    }

    // Textarea
    if (field.type === 'textarea') {
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <textarea
            id={field.name}
            name={field.name}
            rows={4}
            className={baseInputClass}
            required={required}
          />
        </div>
      );
    }

    // Radio
    if (field.type === 'radio') {
      const options = field.options ?? [];
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

    // Checkbox (multi)
    if (field.type === 'checkbox') {
      const options = field.options ?? [];
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
          />
          <span>{field.label}</span>
        </label>
      );
    }

    // Select
    if (field.type === 'select') {
      const options = field.options ?? [];
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <select
            id={field.name}
            name={field.name}
            className={baseInputClass}
            defaultValue=""
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

    // Radio grid
    if (field.type === 'radioGrid') {
      const rows = field.rows ?? [];
      const cols = field.columns ?? [];
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
                  {cols.map((col, cIdx) => (
                    <th key={`${field.name}-col-${cIdx}`} className="p-2 text-xs font-semibold text-gray-600">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => {
                  const rowName = `${field.name}[${rIdx}]`;
                  return (
                    <tr key={`${field.name}-row-${rIdx}`} className="border-t border-gray-200">
                      <th scope="row" className="p-2 text-left text-sm font-medium text-gray-700">
                        {row}
                      </th>
                      {cols.map((col, cIdx) => {
                        const id = `${field.name}-${rIdx}-${cIdx}`;
                        return (
                          <td key={id} className="p-2 text-center">
                            <input
                              type="radio"
                              id={id}
                              name={rowName}
                              value={String(cIdx)}
                              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              aria-label={`${row} - ${col}`}
                              required={required && cIdx === 0}
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

    // Submit (render the actual submit button)
    if (field.type === 'submit') {
      return (
        <div className="pt-2" key={`${field.name}-${idx}`}>
          <button
            type="submit"
            disabled={submitting || submitted}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitted ? 'Submitted' : submitting ? 'Submitting...' : field.label}
          </button>
        </div>
      );
    }

    return null;
  };

  if (submitted) {
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

  return (
    <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-6">
        <h2 className="block text-xl font-semibold text-gray-900">{formData.title}</h2>
        {formData.description && (
          <p className="mt-1 text-sm text-gray-600">{formData.description}</p>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {fields.map((f, idx) => renderField(f, idx))}
      </form>
    </section>
  );
};

export default PublicFormRenderer;