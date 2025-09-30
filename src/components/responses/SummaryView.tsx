import React, { useMemo, useState } from 'react';
import type { FormData, FormField } from '../FormRenderer';
import type { StoredResponse } from '../../services/forms';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import ReportModal from '../common/ReportModal';
type Props = {
  form: FormData | null;
  responses: StoredResponse[];
  height?: string; // overall viewport height for the container area (e.g., '70vh')
};

const COLORS = [
  '#6366F1', // indigo-500
  '#22C55E', // green-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#06B6D4', // cyan-500
  '#A855F7', // purple-500
  '#84CC16', // lime-500
  '#F97316', // orange-500
  '#E11D48', // rose-600
  '#14B8A6', // teal-500
];

/**
 * Get value(s) for a question from a response payload.
 * - checkbox -> always array of strings
 * - others -> string | number | null
 */
function extractValue(field: FormField, resp: StoredResponse): any {
  const raw = resp.payload?.[field.name];
  if (field.type === 'checkbox') {
    if (Array.isArray(raw)) return raw as string[];
    if (raw != null) return [raw];
    return [];
  }
  return raw;
}

/**
 * Build dataset for single-choice (radio/select) or multi-choice (checkbox) questions.
 */
function buildCounts(options: string[] | undefined, values: (string | string[])[], multi = false) {
  const counts: Record<string, number> = Object.create(null);
  // Seed with known options to ensure stable order
  if (options && options.length) {
    for (const opt of options) counts[opt] = 0;
  }
  for (const v of values) {
    if (multi) {
      for (const item of (Array.isArray(v) ? v : [v]).filter(Boolean) as string[]) {
        counts[item] = (counts[item] ?? 0) + 1;
      }
    } else {
      if (typeof v === 'string' && v.length) {
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
  }
  // Convert to recharts-friendly array
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

/**
 * Build datasets for radioGrid:
 * For each row, count occurrences of column index (as label or index string).
 */
function buildRadioGridCounts(field: FormField, responses: StoredResponse[]) {
  const rows = field.rows ?? [];
  const cols = field.columns ?? [];
  const perRow: { row: string; data: { name: string; value: number }[] }[] = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const key = `${field.name}[${rIdx}]`;
    const counts: Record<string, number> = Object.create(null);
    // seed
    for (let cIdx = 0; cIdx < cols.length; cIdx++) {
      const label = cols[cIdx] ?? String(cIdx);
      counts[label] = 0;
    }

    for (const resp of responses) {
      const raw = resp.payload?.[key];
      if (raw == null) continue;
      // raw is column index string (from our public renderer)
      const idx = Number(raw);
      const label = Number.isFinite(idx) && cols[idx] ? cols[idx]! : String(raw);
      counts[label] = (counts[label] ?? 0) + 1;
    }

    perRow.push({
      row: rows[rIdx] ?? `Row ${rIdx + 1}`,
      data: Object.entries(counts).map(([name, value]) => ({ name, value })),
    });
  }

  return perRow;
}

/**
 * Calculate simple average for range questions (ignore NaN).
 */
function calcAverage(nums: number[]) {
  const n = nums.filter((x) => Number.isFinite(x));
  if (n.length === 0) return null;
  const sum = n.reduce((acc, x) => acc + x, 0);
  return sum / n.length;
}

const SummaryView: React.FC<Props> = ({ form, responses, height = '70vh' }) => {
  const fields = useMemo(() => (form?.fields ?? []).filter((f) => f.type !== 'submit'), [form]);

  // AI Report state
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(false);

  // Call backend to generate AI analysis (Markdown)
  const handleGenerateReport = async () => {
    if (!form) {
      setReportError('No form to analyze.');
      return;
    }
    setReportError(null);
    setIsReportLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
      const resp = await fetch(`${apiBase}/analyze-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form,
          // Server expects an array of submission objects; send payloads only
          responses: (responses || []).map((r) => r.payload),
        }),
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(text || 'Failed to generate report.');
      }

      setReportText(text);
      setShowReport(true);
    } catch (e: any) {
      setReportError(e?.message || 'Failed to generate report.');
    } finally {
      setIsReportLoading(false);
    }
  };

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 overflow-auto" style={{ maxHeight: height }}>
      <div className="mb-4 flex items-center justify-end">
        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={isReportLoading || !form || responses.length === 0}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          title="Analyze responses and generate a professional Markdown report"
        >
          {isReportLoading ? 'Generating…' : 'Generate AI Report'}
        </button>
      </div>

      {reportError && (
        <div className="mb-3 rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700">
          {reportError}
        </div>
      )}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-700">
          <h3 className="text-base font-semibold text-gray-900">No questions to summarize</h3>
          <p className="mt-1 text-gray-600">Add questions to your form to see summary charts here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {fields.map((field) => {
            const key = `${field.name}`;
            const label = field.label || key;

            // Prepare per-type summary
            if (field.type === 'radio' || field.type === 'select') {
              const values = responses.map((r) => extractValue(field, r));
              const data = buildCounts(field.options, values, false);
              const smallSet = (field.options?.length ?? data.length) <= 6;

              return (
                <article key={key} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      {smallSet ? (
                        <PieChart>
                          <Pie data={data} dataKey="value" nameKey="name" outerRadius={80}>
                            {data.map((entry, index) => (
                              <Cell key={`cell-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      ) : (
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="value" fill={COLORS[0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </article>
              );
            }

            if (field.type === 'checkbox') {
              const values = responses.map((r) => extractValue(field, r));
              const data = buildCounts(field.options, values, true);
              return (
                <article key={key} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill={COLORS[1]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              );
            }

            if (field.type === 'radioGrid') {
              const perRow = buildRadioGridCounts(field, responses);
              return (
                <article key={key} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="space-y-6">
                    {perRow.map((row, idx) => (
                      <div key={`${key}-row-${idx}`} className="h-56">
                        <div className="mb-2 text-xs font-medium text-gray-600">{row.row}</div>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={row.data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="value" fill={COLORS[idx % COLORS.length]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                </article>
              );
            }

            if (field.type === 'range') {
              const numbers = responses
                .map((r) => {
                  const v = r.payload?.[field.name];
                  const n = Number(v);
                  return Number.isFinite(n) ? n : NaN;
                })
                .filter((n) => Number.isFinite(n)) as number[];
              const avg = calcAverage(numbers);
              const min = (field as any).min ?? 0;
              const max = (field as any).max ?? 10;
              return (
                <article key={key} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="mb-1 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="text-xs text-gray-500 mb-2">Scale: {min} – {max}</div>
                  <div className="text-3xl font-bold text-indigo-700">
                    {avg == null ? '—' : avg.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {numbers.length} responses
                  </div>
                </article>
              );
            }

            // Text-like: list up to N answers
            if (field.type === 'text' || field.type === 'textarea' || field.type === 'email' || field.type === 'password' || field.type === 'date' || field.type === 'time' || field.type === 'file') {
              const items = responses
                .map((r) => r.payload?.[field.name])
                .filter((x) => x != null && String(x).length > 0)
                .slice(0, 100);
              return (
                <article key={key} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                  {items.length === 0 ? (
                    <div className="text-sm text-gray-500">No responses</div>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded border border-gray-200 bg-gray-50 p-3">
                      <ul className="list-disc pl-5 text-sm text-gray-800">
                        {items.map((it, idx) => (
                          <li key={`${key}-item-${idx}`} className="mb-1 whitespace-pre-wrap">
                            {String(it)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            }

            // Fallback: treat as text
            const items = responses
              .map((r) => r.payload?.[field.name])
              .filter((x) => x != null && String(x).length > 0)
              .slice(0, 100);
            return (
              <article key={key} className="rounded-lg border border-gray-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                {items.length === 0 ? (
                  <div className="text-sm text-gray-500">No responses</div>
                ) : (
                  <div className="max-h-56 overflow-auto rounded border border-gray-200 bg-gray-50 p-3">
                    <ul className="list-disc pl-5 text-sm text-gray-800">
                      {items.map((it, idx) => (
                        <li key={`${key}-item-${idx}`} className="mb-1 whitespace-pre-wrap">
                          {String(it)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {showReport && (
        <ReportModal text={reportText} onClose={() => setShowReport(false)} />
      )}
    </section>
  );
};

export default SummaryView;