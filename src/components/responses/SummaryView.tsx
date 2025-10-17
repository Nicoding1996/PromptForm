import React, { useMemo, useState, useRef, useEffect } from 'react';
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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Papa from 'papaparse';
import { Download, Loader2 } from 'lucide-react';
import colors from 'tailwindcss/colors';
import Card from '../ui/Card';
import { calculateResult } from '../../utils/scoring';
import ConfirmModal from '../common/ConfirmModal';
import { toast } from 'react-hot-toast';
import { updateFormAiSummary } from '../../services/forms';
import { resolveServerBase } from '../../services/ai';
type Props = {
  formId?: string;
  aiSummaryInitial?: string;
  form: FormData | null;
  responses: StoredResponse[];
  height?: string; // overall viewport height for the container area (e.g., '70vh')
};

const THEME = {
  primary: colors.indigo,
  neutral: colors.slate,
  success: colors.green,
  danger: colors.red,
  warning: colors.amber,
  cyan: colors.cyan,
  purple: colors.violet,
  lime: colors.lime,
  orange: colors.orange,
  rose: colors.rose,
  teal: colors.teal,
};

// Branded palettes
const CATEGORICAL = [
  THEME.primary[500], // Indigo 500
  THEME.neutral[500], // Slate 500
  THEME.primary[300], // Indigo 300
  THEME.neutral[300], // Slate 300
];

// Sequential palette mapped to Poor -> Fair -> Good -> Excellent
const SEQ_ORDER = ['poor', 'fair', 'good', 'excellent'] as const;
const SEQUENTIAL = [
  THEME.neutral[300], // Poor
  THEME.primary[200], // Fair
  THEME.primary[400], // Good
  THEME.primary[600], // Excellent
];

function normalizeLabel(x: string | undefined | null) {
  return String(x ?? '').trim().toLowerCase();
}

function looksLikeSequential(options?: string[]) {
  if (!options || options.length < 3) return false;
  return options.every((o) => (SEQ_ORDER as readonly string[]).includes(normalizeLabel(o)));
}

function sequentialColorForLabel(name: string) {
  const idx = (SEQ_ORDER as readonly string[]).indexOf(normalizeLabel(name));
  return idx >= 0 ? SEQUENTIAL[idx] : CATEGORICAL[0];
}

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
 * For each row, count occurrences of selected column label.
 * Supports legacy payloads (bracket keys with index) and new payloads
 * (nested objects and/or flattened dot keys with labels).
 */
function buildRadioGridCounts(field: FormField, responses: StoredResponse[]) {
  const rows = field.rows ?? [];
  const cols = field.columns ?? [];
  const labelForCol = (cIdx: number) => {
    const c = (cols as any[])[cIdx];
    return typeof c === 'string' ? (c as string) : (c?.label ?? String(cIdx));
  };

  const perRow: { row: string; data: { name: string; value: number }[] }[] = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const rowLabel = rows[rIdx] ?? `Row ${rIdx + 1}`;
    const bracketKey = `${field.name}[${rIdx}]`;
    const dotKey = `${field.name}.${rowLabel}`;
    const counts: Record<string, number> = Object.create(null);

    // seed counts with column labels
    for (let cIdx = 0; cIdx < cols.length; cIdx++) {
      const label = labelForCol(cIdx);
      counts[label] = 0;
    }

    for (const resp of responses) {
      let selLabel: string | null = null;

      // New nested structure: payload[field.name][rowLabel] = "Column Label"
      const nested = (resp.payload?.[field.name] as any) ?? null;
      if (nested && typeof nested === 'object' && nested[rowLabel] != null) {
        selLabel = String(nested[rowLabel]);
      } else if (resp.payload && Object.prototype.hasOwnProperty.call(resp.payload, dotKey)) {
        // New flattened dot key: payload["grid.Row Label"] = "Column Label"
        selLabel = String(resp.payload[dotKey]);
      } else {
        // Legacy bracket key: payload["grid[0]"] = "2" (index)
        const raw = resp.payload?.[bracketKey];
        if (raw != null) {
          const idx = Number(raw);
          if (Number.isFinite(idx) && idx >= 0 && idx < cols.length) {
            selLabel = labelForCol(idx);
          } else {
            selLabel = String(raw);
          }
        }
      }

      if (selLabel != null && selLabel.length > 0) {
        counts[selLabel] = (counts[selLabel] ?? 0) + 1;
      }
    }

    perRow.push({
      row: rowLabel,
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

/**
 * Compute a dynamic bottom margin for X-axis tick labels (angled at -45deg).
 * Uses the longest label length to reserve space. Clamped to sensible bounds.
 */
function computeBottomMarginForNames(names: string[]): number {
  const longest = names.reduce((m, name) => Math.max(m, String(name ?? '').length), 0);
  // Base ~60px + scaled by label length; clamp to [70, 140]
  return Math.max(70, Math.min(140, 40 + longest * 2.2));
}

const SummaryView: React.FC<Props> = ({ formId, aiSummaryInitial, form, responses, height = '70vh' }) => {
  const fields = useMemo(
    () => (form?.fields ?? []).filter((f) => f.type !== 'submit' && f.type !== 'section'),
    [form]
  );

  const outcomeDistribution = useMemo(() => {
    if (!form || !responses || responses.length === 0) return null;
    const qt = (form as any)?.quizType as ('KNOWLEDGE' | 'OUTCOME' | undefined);
    if (qt !== 'OUTCOME') return null;

    const snake = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const pages = Array.isArray(form.resultPages) ? form.resultPages : [];
    const orderedIds: string[] = pages.map((p) => (p as any).outcomeId || snake(p.title));
    const titleById: Record<string, string> = {};
    pages.forEach((p) => {
      const id = (p as any).outcomeId || snake(p.title);
      titleById[id] = p.title;
    });

    const counts: Record<string, number> = {};
    orderedIds.forEach((id) => (counts[id] = 0));

    for (const r of responses) {
      try {
        const res: any = calculateResult(form, r.payload || {});
        if (res?.type === 'OUTCOME') {
          let id: string | null = res.outcomeId || null;
          if (!id && res.outcomeTitle) {
            // fallback: map title -> id
            const t = String(res.outcomeTitle).trim().toLowerCase();
            const found = pages.find((p) => String(p?.title || '').trim().toLowerCase() === t);
            if (found) id = (found as any).outcomeId || snake(found.title);
          }
          if (id) {
            counts[id] = (counts[id] ?? 0) + 1;
            if (!titleById[id]) {
              titleById[id] = res.outcomeTitle || id;
            }
          }
        }
      } catch {
        // ignore scoring failures in summary
      }
    }

    const data: { name: string; value: number }[] = [];
    // push in configured order first
    for (const id of orderedIds) {
      data.push({ name: titleById[id] || id, value: counts[id] ?? 0 });
    }
    // include any extra ids that appeared but weren't configured
    for (const id of Object.keys(counts)) {
      if (!orderedIds.includes(id)) {
        data.push({ name: titleById[id] || id, value: counts[id] ?? 0 });
      }
    }
    return data;
  }, [form, responses]);

  // AI Report state
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportText, setReportText] = useState(aiSummaryInitial || '');
  // Flag to scroll only right after we generate a new report (avoid on mount/tab revisit)
  const [justGenerated, setJustGenerated] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  // Scroll only immediately after generating a new report (not on initial mount or tab switch)
  useEffect(() => {
    if (justGenerated && reportText && summaryRef.current) {
      summaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setJustGenerated(false);
    }
  }, [reportText, justGenerated]);

  // Sync local state with server-provided initial summary after async load
  useEffect(() => {
    if (aiSummaryInitial && aiSummaryInitial !== reportText) {
      setReportText(aiSummaryInitial);
    }
  }, [aiSummaryInitial]);

  // Generate and persist AI analysis (Markdown)
  const generateAndSave = async () => {
    if (!form) {
      setReportError('No form to analyze.');
      return;
    }
    setReportError(null);
    setIsReportLoading(true);
    try {
      const apiBase = resolveServerBase();
      const resp = await fetch(`${apiBase}/analyze-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          form,
          // Server expects an array of submission objects; send payloads only
          responses: (responses || []).map((r) => r.payload),
        }),
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(text || 'Failed to generate report.');
      }

      // Mark that this report was just generated to trigger a one-time scroll
      setJustGenerated(true);
      setReportText(text);
      
      // Persist via authenticated client (avoids server-side permission issues)
      if (formId) {
        try {
          await updateFormAiSummary(formId, text);
          toast.success('AI summary saved');
        } catch (persistErr: any) {
          // Still show the summary; inform user persistence failed
          console.warn('[SummaryView] Failed to persist AI summary:', persistErr);
          toast.error('Generated summary could not be saved. It will disappear after refresh.');
        }
      }
    } catch (e: any) {
      setReportError(e?.message || 'Failed to generate report.');
    } finally {
      setIsReportLoading(false);
    }
  };

  // Click handler with re-generation confirmation if a report already exists
  const handleAnalyzeClick = () => {
    if (reportText && reportText.trim().length > 0) {
      setConfirmOpen(true);
    } else {
      void generateAndSave();
    }
  };

  // Download all responses as CSV using schema-on-read (unified headers)
  const handleExportCsv = () => {
    if (!form || !responses || responses.length === 0) return;

    const fields = (form.fields ?? []).filter((f) => f.type !== 'submit' && f.type !== 'section');

    type ColDesc = {
      header: string;
      extractor: (r: StoredResponse) => string | number | null;
    };

    const cols: ColDesc[] = [];

    // Helper for radioGrid to map column index -> label
    const gridLabelForCol = (field: FormField, idx: number): string => {
      const c: any = (field as any).columns?.[idx];
      if (typeof c === 'string') return c;
      return String(c?.label ?? idx);
      };

    for (const f of fields) {
      // radioGrid expands into multiple columns (one per row)
      if (f.type === 'radioGrid') {
        const rows = f.rows ?? [];
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const rowLabel = rows[rIdx] ?? `Row ${rIdx + 1}`;
          const header = `${f.label}: ${rowLabel}`;
          const bracketKey = `${f.name}[${rIdx}]`;
          const dotKey = `${f.name}.${rowLabel}`;
          cols.push({
            header,
            extractor: (resp) => {
              // New nested: payload[fieldName][rowLabel] = "Column Label"
              const nested = (resp.payload?.[f.name] as any) ?? null;
              if (nested && typeof nested === 'object' && nested[rowLabel] != null) {
                return String(nested[rowLabel]);
              }
              // New flattened dot key
              if (resp.payload && Object.prototype.hasOwnProperty.call(resp.payload, dotKey)) {
                return String(resp.payload[dotKey]);
              }
              // Legacy: bracket key may be a column index
              const raw = resp.payload?.[bracketKey];
              if (raw != null) {
                const n = Number(raw);
                if (Number.isFinite(n)) {
                  return gridLabelForCol(f, n);
                }
                return String(raw);
              }
              return '';
            },
          });
        }
        continue;
      }

      // checkbox joins multiple values into CSV-friendly string
      if (f.type === 'checkbox') {
        cols.push({
          header: f.label,
          extractor: (resp) => {
            const v = resp.payload?.[f.name];
            if (Array.isArray(v)) return v.join(', ');
            if (v != null) return String(v);
            return '';
          },
        });
        continue;
      }

      // default: single value
      cols.push({
        header: f.label,
        extractor: (resp) => {
          const v = resp.payload?.[f.name];
          if (v == null) return '';
          if (Array.isArray(v)) return v.join(', ');
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        },
      });
    }

    // Optional: submission timestamp column at the end
    cols.push({
      header: 'Submitted At',
      extractor: (resp) => (resp.createdAt?.toDate ? resp.createdAt.toDate().toISOString() : ''),
    });

    // Build CSV rows with unified headers
    const rows = responses.map((r) => {
      const out: Record<string, string | number> = {};
      for (const c of cols) {
        const val = c.extractor(r);
        out[c.header] = (val == null ? '' : (val as any)) as string | number;
      }
      return out;
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = (form.title || 'form').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    a.download = `${base || 'form'}-responses.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-auto" style={{ maxHeight: height }}>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!form || responses.length === 0}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-60"
          title="Download all responses as a CSV file"
        >
          <span className="inline-flex items-center gap-1">
            <Download className="h-4 w-4" /> CSV
          </span>
        </button>

        <button
          type="button"
          onClick={handleAnalyzeClick}
          disabled={isReportLoading || !form || responses.length === 0}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-60"
          title="Analyze responses and generate a professional Markdown report"
        >
          {isReportLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              ✨ Analyze Responses
            </span>
          )}
        </button>
      </div>

      {reportError && (
        <div className="mb-3 rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700">
          {reportError}
        </div>
      )}

      {outcomeDistribution && outcomeDistribution.length > 0 && (
        <Card className="mb-4 p-4">
          <h3 className="mb-2 text-base font-semibold text-neutral-900">Overall Outcome Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={outcomeDistribution}
                margin={{
                  top: 12,
                  right: 12,
                  left: 12,
                  bottom: computeBottomMarginForNames(outcomeDistribution.map((d: any) => String((d as any).name ?? '')))
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                  height={90}
                  tick={{ fontSize: 12 }}
                  tickMargin={8}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value">
                  {outcomeDistribution.map((_, idx) => (
                    <Cell key={`outcome-bar-${idx}`} fill={THEME.primary[500]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
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
                <Card key={key} className="p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {smallSet ? (
                        <PieChart>
                          <Pie data={data} dataKey="value" nameKey="name" outerRadius={80}>
                            {data.map((entry, index) => {
                              const name = String((entry as any).name ?? '');
                              const isSeq = looksLikeSequential(field.options as any);
                              const fill = isSeq ? sequentialColorForLabel(name) : CATEGORICAL[index % CATEGORICAL.length];
                              return <Cell key={`cell-${name}-${index}`} fill={fill} />;
                            })}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      ) : (
                        <BarChart
                          data={data}
                          margin={{
                            top: 12,
                            right: 12,
                            left: 12,
                            bottom: computeBottomMarginForNames(data.map((d: any) => String((d as any).name ?? '')))
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="name"
                            angle={-45}
                            textAnchor="end"
                            interval={0}
                            height={90}
                            tick={{ fontSize: 12 }}
                            tickMargin={8}
                          />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="value">
                            {data.map((entry, idx) => {
                              const name = String((entry as any).name ?? '');
                              const isSeq = looksLikeSequential(field.options as any);
                              const fill = isSeq ? sequentialColorForLabel(name) : CATEGORICAL[idx % CATEGORICAL.length];
                              return <Cell key={`bar-${name}-${idx}`} fill={fill} />;
                            })}
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </Card>
              );
            }

            if (field.type === 'checkbox') {
              const values = responses.map((r) => extractValue(field, r));
              const data = buildCounts(field.options, values, true);
              return (
                <Card key={key} className="p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data}
                        margin={{
                          top: 12,
                          right: 12,
                          left: 12,
                          bottom: computeBottomMarginForNames(data.map((d: any) => String((d as any).name ?? '')))
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          angle={-45}
                          textAnchor="end"
                          interval={0}
                          height={90}
                          tick={{ fontSize: 12 }}
                          tickMargin={8}
                        />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value">
                          {data.map((entry, idx) => (
                            <Cell key={`chk-${String((entry as any).name ?? '')}-${idx}`} fill={CATEGORICAL[idx % CATEGORICAL.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              );
            }

            if (field.type === 'radioGrid') {
              const perRow = buildRadioGridCounts(field, responses);
              return (
                <Card key={key} className="p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="space-y-6">
                    {perRow.map((row, idx) => (
                      <div key={`${key}-row-${idx}`} className="h-80">
                        <div className="mb-2 text-xs font-medium text-gray-600">{row.row}</div>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={row.data}
                            margin={{
                              top: 12,
                              right: 12,
                              left: 12,
                              bottom: computeBottomMarginForNames(row.data.map((d: any) => String((d as any).name ?? '')))
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="name"
                              angle={-45}
                              textAnchor="end"
                              interval={0}
                              height={90}
                              tick={{ fontSize: 12 }}
                              tickMargin={8}
                            />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="value">
                              {row.data.map((entry, j) => (
                                <Cell key={`grid-${String((entry as any).name ?? '')}-${j}`} fill={CATEGORICAL[j % CATEGORICAL.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                </Card>
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
                <Card key={key} className="p-4">
                  <h4 className="mb-1 text-sm font-semibold text-gray-900">{label}</h4>
                  <div className="text-xs text-gray-500 mb-2">Scale: {min} – {max}</div>
                  <div className="text-3xl font-bold text-primary-700">
                    {avg == null ? '—' : avg.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {numbers.length} responses
                  </div>
                </Card>
              );
            }

            // Text-like: list up to N answers
            if (field.type === 'text' || field.type === 'textarea' || field.type === 'email' || field.type === 'password' || field.type === 'date' || field.type === 'time' || field.type === 'file') {
              const items = responses
                .map((r) => r.payload?.[field.name])
                .filter((x) => x != null && String(x).length > 0)
                .slice(0, 100);
              return (
                <Card key={key} className="p-4">
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
                </Card>
              );
            }

            // Fallback: treat as text
            const items = responses
              .map((r) => r.payload?.[field.name])
              .filter((x) => x != null && String(x).length > 0)
              .slice(0, 100);
            return (
              <Card key={key} className="p-4">
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
              </Card>
            );
          })}
        </div>
      )}

      {reportText && (
        <Card className="mt-4 p-4" ref={summaryRef as any}>
          <h3 className="mb-2 text-base font-semibold text-neutral-900">AI-Powered Summary</h3>
          <div className="prose prose-sm max-w-none text-neutral-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportText}</ReactMarkdown>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(reportText);
                  toast.success('Report copied to clipboard');
                } catch {
                  toast.error('Copy failed');
                }
              }}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              Copy Report
            </button>
          </div>
        </Card>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Replace existing summary?"
        message="A summary already exists. Generating a new analysis will replace the current report."
        confirmText="Replace"
        cancelText="Cancel"
        onConfirm={() => {
          setConfirmOpen(false);
          void generateAndSave();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default SummaryView;