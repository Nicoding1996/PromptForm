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

  const renderCell = (resp: StoredResponse, col: { key: string; label: string; field: FormField }) => {
    const v = resp.payload?.[col.key];
    // For checkbox groups or duplicated keys we combined into arrays at submit time
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return String(v ?? '');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Responses</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              Back to Dashboard
            </Link>
            {formId && (
              <Link
                to={`/form/${formId}`}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              >
                View Public Form
              </Link>
            )}
          </div>
        </header>

        {loading ? (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-1/3 rounded bg-gray-200" />
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-5 w-1/2 rounded bg-gray-200" />
            </div>
          </section>
        ) : error ? (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-red-700">Error: {error}</p>
          </section>
        ) : !form ? (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-700">Form not found.</p>
          </section>
        ) : responses.length === 0 ? (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-700">No responses yet.</p>
          </section>
        ) : (
          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 overflow-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-2 text-left text-xs font-semibold text-gray-600">#</th>
                  <th className="p-2 text-left text-xs font-semibold text-gray-600">Submitted</th>
                  {columns.map((c) => (
                    <th key={c.key} className="p-2 text-left text-xs font-semibold text-gray-600">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {responses.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="p-2 text-sm text-gray-700">{idx + 1}</td>
                    <td className="p-2 text-xs text-gray-500">
                      {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ''}
                    </td>
                    {columns.map((c) => (
                      <td key={`${r.id}-${c.key}`} className="p-2 text-sm text-gray-800">
                        {renderCell(r, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
};

export default ResponsesPage;