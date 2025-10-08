import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFormById, listResponsesForForm, type StoredResponse } from '../services/forms';
import type { FormData, FormField } from '../components/FormRenderer';
import Card from '../components/ui/Card';
import SummaryView from '../components/responses/SummaryView';
import IndividualResponsesView from '../components/responses/IndividualResponsesView';

type TabKey = 'summary' | 'question' | 'individual';

const ResponsesPage: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData | null>(null);
  const [responses, setResponses] = useState<StoredResponse[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('summary');

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
        const [formRow, respRows] = await Promise.all([getFormById(formId), listResponsesForForm(formId)]);
        if (!alive) return;
        setForm(formRow?.form ?? null);
        setResponses(respRows);
        setAiSummary((formRow as any)?.aiSummary || '');
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
    <div className="min-h-screen bg-neutral-50">
      <main className="app-container">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">Responses</h1>
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="btn-ghost">Back to Dashboard</Link>
            {formId && (
              <Link to={`/form/${formId}`} className="btn-ghost">View Public Form</Link>
            )}
          </div>
        </header>

        {loading ? (
          <Card className="p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-1/3 rounded bg-gray-200" />
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-5 w-1/2 rounded bg-gray-200" />
            </div>
          </Card>
        ) : error ? (
          <Card className="p-6">
            <p className="text-sm text-red-700">Error: {error}</p>
          </Card>
        ) : !form ? (
          <Card className="p-6">
            <p className="text-sm text-neutral-700">Form not found.</p>
          </Card>
        ) : responses.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-neutral-700">No responses yet.</p>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-neutral-200 p-3" role="tablist" aria-label="Responses tabs">
              <button
                id="rs-tab-summary"
                role="tab"
                aria-controls="rs-panel-summary"
                type="button"
                onClick={() => setActiveTab('summary')}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/50 ' +
                  (activeTab === 'summary' ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-50')
                }
                aria-selected={activeTab === 'summary'}
              >
                Summary
              </button>
              <button
                id="rs-tab-question"
                role="tab"
                aria-controls="rs-panel-question"
                type="button"
                onClick={() => setActiveTab('question')}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/50 ' +
                  (activeTab === 'question' ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-50')
                }
                aria-selected={activeTab === 'question'}
              >
                Question
              </button>
              <button
                id="rs-tab-individual"
                role="tab"
                aria-controls="rs-panel-individual"
                type="button"
                onClick={() => setActiveTab('individual')}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/50 ' +
                  (activeTab === 'individual' ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-50')
                }
                aria-selected={activeTab === 'individual'}
              >
                Individual
              </button>
            </div>

            {/* Panels */}
            {activeTab === 'summary' && (
              <div id="rs-panel-summary" role="tabpanel" aria-labelledby="rs-tab-summary" className="p-4" tabIndex={0}>
                <SummaryView formId={formId} aiSummaryInitial={aiSummary} form={form} responses={responses} height="70vh" />
              </div>
            )}

            {activeTab === 'question' && (
              <div
                id="rs-panel-question"
                role="tabpanel"
                aria-labelledby="rs-tab-question"
                className="rounded-lg border border-dashed border-gray-300 m-4 p-6 text-sm text-gray-700"
                tabIndex={0}
              >
                <h2 className="text-base font-semibold text-gray-900">Question View (Coming Soon)</h2>
                <p className="mt-1 text-gray-600">Per-question breakdown will appear here.</p>
              </div>
            )}

            {activeTab === 'individual' && (
              <div id="rs-panel-individual" role="tabpanel" aria-labelledby="rs-tab-individual" className="p-4" tabIndex={0}>
                <IndividualResponsesView form={form} responses={responses} columns={columns as any} height="70vh" />
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
};

export default ResponsesPage;