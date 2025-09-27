import React, { useMemo, useState } from 'react';
import type { FormData, FormField } from '../FormRenderer';
import type { StoredResponse } from '../../services/forms';

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

  return (
    <section className="rounded-xl bg-white p-0 shadow-sm ring-1 ring-gray-200 overflow-hidden">
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
                      'w-full text-left px-3 py-3 transition ' +
                      (active ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50')
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
                  }))
                : Object.entries(r.payload || {}).map(([k, v]) => ({ label: k, value: v }));

            const format = (v: any) =>
              Array.isArray(v)
                ? v.join(', ')
                : typeof v === 'object' && v !== null
                ? JSON.stringify(v)
                : String(v ?? '');

            return (
              <div className="space-y-4">
                <div className="mb-2">
                  <div className="text-sm text-gray-500">
                    {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ''}
                  </div>
                </div>

                {pairs.map((p, i) => (
                  <div key={i} className="pb-4 border-b border-gray-100">
                    <strong className="block text-sm text-gray-700">{p.label}</strong>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{format(p.value)}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </main>
      </div>
    </section>
  );
};

export default IndividualResponsesView;