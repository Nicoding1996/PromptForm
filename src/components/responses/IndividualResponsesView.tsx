import React, { useMemo, useRef, useState } from 'react';
import type { FormData, FormField } from '../FormRenderer';
import type { StoredResponse } from '../../services/forms';
import { Download, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import GridResponseDisplay from './GridResponseDisplay';

export type Column = { key: string; label: string; field: FormField };

type Props = {
  form: FormData | null;
  responses: StoredResponse[];
  // Precomputed columns from form fields (excluding submit). If omitted, falls back to form fields or payload keys.
  columns?: Column[];
  height?: string; // e.g. '70vh'
};

const IndividualResponsesView: React.FC<Props> = ({ form, responses, columns = [], height = '70vh' }) => {
  const [selectedResponseIndex, setSelectedResponseIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const orderedColumns: Column[] = useMemo(() => {
    // Highest priority: caller-provided columns
    if (columns.length > 0) return columns;

    // Next: derive from form fields (exclude submit) so labels/order match the form
    if (form?.fields && form.fields.length > 0) {
      const fields = form.fields.filter((f) => f.type !== 'submit');
      return fields.map((f) => ({ key: f.name, label: f.label, field: f }));
    }

    // Fallback: build from first response payload keys
    const first = responses[0]?.payload ?? {};
    return Object.keys(first).map((k) => ({
      key: k,
      label: k,
      field: { name: k, label: k, type: 'text' } as FormField,
    }));
  }, [columns, form, responses]);

  if (!responses || responses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-700">
        <h3 className="text-base font-semibold text-gray-900">No responses yet</h3>
        <p className="mt-1 text-gray-600">Responses will appear here as they are submitted.</p>
      </div>
    );
  }

  // Fully deterministic, data-driven PDF (no canvas). This avoids blank/blocked PDFs across browsers.
  const handleExportPdf = async () => {
    const r = responses[selectedResponseIndex];
    if (!r) return;

    setExportingPdf(true);
    try {
      const pairs =
        orderedColumns.length > 0
          ? orderedColumns.map((c) => ({ label: c.label, value: r.payload?.[c.key], field: c.field }))
          : Object.entries(r.payload || {}).map(([k, v]) => ({ label: k, value: v, field: undefined }));

      const toStr = (v: any) =>
        Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      let y = margin;

      // Title
      const title = (form?.title || 'Form Submission').toString();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text(title, margin, y);
      y += 8;

      // Timestamp
      const ts = r.createdAt?.toDate ? r.createdAt.toDate() : undefined;
      if (ts) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text(ts.toLocaleString(), margin, y);
        y += 8;
      }

      // Fields
      pdf.setFontSize(11);
      for (const p of pairs) {
        const label = String(p.label ?? '');
        const wrapWidth = pageWidth - margin * 2;

        // Page break if needed before label
        if (y + 6 > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.text(label, margin, y);
        y += 5;

        pdf.setFont('helvetica', 'normal');

        let lines: string[] = [];
        if (p.field?.type === 'radioGrid') {
          const f = p.field as any;
          const rows: string[] = f.rows ?? [];
          const cols: any[] = f.columns ?? [];
          const colLabel = (idx: number) => {
            const c = cols[idx];
            return typeof c === 'string' ? c : (c?.label ?? String(idx));
          };
          const nested = (r.payload?.[f.name] as any) ?? null;
          rows.forEach((rowLabel: string, rIdx: number) => {
            let ans: string = '';
            if (nested && typeof nested === 'object' && nested[rowLabel] != null) {
              ans = String(nested[rowLabel] ?? '');
            } else if (Object.prototype.hasOwnProperty.call(r.payload || {}, `${f.name}.${rowLabel}`)) {
              ans = String((r.payload as any)[`${f.name}.${rowLabel}`] ?? '');
            } else {
              const raw = (r.payload as any)?.[`${f.name}[${rIdx}]`];
              if (raw != null) {
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 0 && n < cols.length) ans = colLabel(n);
                else ans = String(raw);
              }
            }
            lines.push(`${rowLabel}: ${ans || '—'}`);
          });
        } else {
          const val = toStr(p.value);
          lines = pdf.splitTextToSize(val, wrapWidth) as string[];
        }

        for (const line of lines) {
          if (y + 6 > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += 5;
        }

        y += 4; // spacing between fields
      }

      // Filename
      const idx = selectedResponseIndex + 1;
      const tsStr = ts ? ts.toISOString().slice(0, 19).replace(/[:T]/g, '-') : 'unknown';
      const base = (form?.title || 'form').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
      const filename = `${base || 'form'}-submission-${idx}-${tsStr}.pdf`;

      try {
        pdf.save(filename);
      } catch {
        // Fallback save
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
      }
    } catch {
      // If anything throws, create a minimal error PDF so the user still gets feedback
      try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.text('Failed to generate PDF (data mode).', 10, 10);
        pdf.save('export-error.pdf');
      } catch {}
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="overflow-hidden">
      <div className="flex" style={{ height }}>
        {/* Left Sidebar: Submission list */}
        <aside className="w-64 border-r border-gray-200 overflow-y-auto">
          <ul className="divide-y divide-gray-100">
            {responses.map((r, idx) => {
              const active = idx === selectedResponseIndex;
              const ts = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : 'Unknown date';
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedResponseIndex(idx)}
                    className={
                      'w-full text-left px-3 py-3 transition ' + (active ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-50')
                    }
                    title={`Open submission #${idx + 1}`}
                  >
                    <div className="text-sm font-medium">{`Submission #${idx + 1}`}</div>
                    <div className="text-xs text-gray-500">{ts}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Main Content: Selected response details */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Toolbar */}
          <div className="mb-3 flex items-center justify-end">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              aria-busy={exportingPdf}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Download this submission as a PDF"
            >
              {exportingPdf ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Downloading…</>
              ) : (
                <><Download className="h-4 w-4" /> Download PDF</>
              )}
            </button>
          </div>

          {(() => {
            const r = responses[selectedResponseIndex];
            if (!r) {
              return <p className="text-sm text-gray-500">Select a submission to view details.</p>;
            }

            // Prefer ordered form fields; if missing, fall back to raw payload entries
            const pairs =
              orderedColumns.length > 0
                ? orderedColumns.map((c) => ({
                    label: c.label,
                    value: r.payload?.[c.key],
                    field: c.field,
                  }))
                : Object.entries(r.payload || {}).map(([k, v]) => ({ label: k, value: v, field: undefined }));

            const format = (v: any) =>
              Array.isArray(v)
                ? v.join(', ')
                : typeof v === 'object' && v !== null
                ? JSON.stringify(v)
                : String(v ?? '');

            return (
              <div ref={contentRef} id="pdf-capture" className="space-y-4">
                <div className="mb-2">
                  <div className="text-sm text-gray-500">
                    {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ''}
                  </div>
                </div>

                {pairs.map((p, i) => (
                  <div key={i} className="pb-4 border-b border-gray-100">
                    <strong className="block text-sm text-gray-700">{p.label}</strong>
                    {p.field?.type === 'radioGrid' ? (
                      <div className="mt-1">
                        <GridResponseDisplay field={p.field as any} payload={r.payload} />
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{format(p.value)}</p>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </main>
      </div>
    </div>
  );
};

export default IndividualResponsesView;