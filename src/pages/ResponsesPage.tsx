import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFormById, listResponsesForForm, type StoredResponse } from '../services/forms';
import type { FormData, FormField } from '../components/FormRenderer';

const ResponsesPage: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData | null>(null);
  const [responses, setResponses] = useState<StoredResponse[]>([]);
  // Which submission is currently selected in the new sidebar
  const [selectedResponseIndex, setSelectedResponseIndex] = useState(0);

  // Columns are derived from form fields (excluding submit)
  const columns = useMemo(() => {
    if (!form) return [] as { key: string; label: string; field: FormField }[];
    const fields = (form.fields ?? []).filter((f) => f.type !== 'submit');
    return fields.map((f) => ({ key: f.name, label: f.label, field: f }));
  }, [form]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!formId) {
        setError('Missing formId');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [formRow, respRows] = await Promise.all([
          getFormById(formId),
          listResponsesForForm(formId),
        ]);
        if (!alive) return;
        setForm(formRow?.form ?? null);
        setResponses(respRows);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Failed to load responses.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [formId]);


  return (
    <div className="min-h-screen bg-slate-100">
      <main className="app-container">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Responses</h1>
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="btn-ghost">
              Back to Dashboard
            </Link>
            {formId && (
              <Link to={`/form/${formId}`} className="btn-ghost">
                View Public Form
              </Link>
            )}
          </div>
        </header>

        {loading ? (
          <section className="card p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-1/3 rounded bg-gray-200" />
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-5 w-1/2 rounded bg-gray-200" />
            </div>
          </section>
        ) : error ? (
          <section className="card p-6">
            <p className="text-sm text-red-700">Error: {error}</p>
          </section>
        ) : !form ? (
          <section className="card p-6">
            <p className="text-sm text-slate-700">Form not found.</p>
          </section>
        ) : responses.length === 0 ? (
          <section className="card p-6">
            <p className="text-sm text-slate-700">No responses yet.</p>
          </section>
        ) : (
          <section className="card p-0 overflow-hidden">
            <div className="flex h-[70vh]">
              {/* Left Sidebar: Submission list */}
              <aside className="w-64 border-r border-gray-200 overflow-y-auto">
                <ul className="divide-y divide-gray-100">
                  {responses.map((r, idx) => {
                    const active = idx === selectedResponseIndex;
                    const ts = r.createdAt?.toDate
                      ? r.createdAt.toDate().toLocaleString()
                      : 'Unknown date';
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
                    columns.length > 0
                      ? columns.map((c) => ({
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
                          <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                            {format(p.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </main>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default ResponsesPage;