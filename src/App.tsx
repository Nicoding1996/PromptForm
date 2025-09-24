import React, { useState } from 'react';

interface FormField {
  label: string;
  type: 'text' | 'email' | 'textarea' | 'radio' | 'checkbox' | 'submit';
  name: string;
  options?: string[];
}

interface FormData {
  title: string;
  fields: FormField[];
}

interface FormRendererProps {
  formData: FormData | null;
}

const FormRenderer: React.FC<FormRendererProps> = ({ formData }) => {
  if (!formData) return null;

  return (
    <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">{formData.title}</h2>
      <form className="space-y-5">
        {formData.fields.map((field, idx) => {
          const key = `${field.name}-${idx}`;

          if (field.type === 'text' || field.type === 'email') {
            return (
              <div className="flex flex-col gap-2" key={key}>
                <label className="text-sm font-medium text-gray-700" htmlFor={field.name}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            );
          }

          if (field.type === 'textarea') {
            return (
              <div className="flex flex-col gap-2" key={key}>
                <label className="text-sm font-medium text-gray-700" htmlFor={field.name}>
                  {field.label}
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  rows={4}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            );
          }

          if (field.type === 'radio' || field.type === 'checkbox') {
            const options = field.options ?? [];
            return (
              <div className="flex flex-col gap-2" key={key}>
                <span className="text-sm font-medium text-gray-700">{field.label}</span>
                <div className="flex flex-col gap-2">
                  {options.map((opt, optIdx) => {
                    const optId = `${field.name}-${optIdx}`;
                    return (
                      <div className="flex items-center gap-2" key={optId}>
                        <input
                          type={field.type}
                          id={optId}
                          name={field.name}
                          value={opt}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label className="text-sm text-gray-700" htmlFor={optId}>{opt}</label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          if (field.type === 'submit') {
            return (
              <div className="pt-2" key={key}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500  -2 -offset-2 -indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {field.label}
                </button>
              </div>
            );
          }

          return null;
        })}
      </form>
    </section>
  );
};

const App: React.FC = () => {
  const [promptText, setPromptText] = useState<string>('');
  const [formJson, setFormJson] = useState<FormData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    if (!promptText.trim()) {
      setError('Please enter a prompt.');
      return;
    }

    setIsLoading(true);
    try {
      const resp = await fetch('http://localhost:3001/generate-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });

      let data: unknown = null;
      try {
        data = await resp.json();
      } catch {
        // ignore JSON parse errors; handled below
      }

      if (!resp.ok) {
        console.error('Generate form error', {
          status: resp.status,
          statusText: resp.statusText,
          details: data,
        });
        const message = (() => {
          if (data && typeof data === 'object') {
            const d = data as Record<string, unknown>;
            if (typeof d.error === 'string') return d.error;
            if (typeof d.message === 'string') return d.message;
          }
          return 'Failed to generate form.';
        })();
        setError(message);
        setFormJson(null);
      } else {
        setFormJson(data as FormData);
      }
    } catch (err) {
      console.error('Network or parsing error:', err);
      setError('Network error while contacting backend.');
      setFormJson(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            PromptForm
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Describe the form you want to create.
          </p>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="promptText">
              Prompt
            </label>
            <textarea
              id="promptText"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={8}
              placeholder="Describe the form you want to generate..."
              className="min-h-[160px] w-full rounded-lg border border-gray-300 bg-white p-4 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p
              role="status"
              className="mt-4 rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500  -2 -offset-2 -indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading && (
                <svg
                  className="h-5 w-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"
                  />
                </svg>
              )}
              {isLoading ? 'Generating...' : 'Generate Form'}
            </button>
          </div>
        </section>

        {/* Loading placeholder / generated form */}
        {isLoading ? (
          <section
            aria-label="Loading form"
            className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
          >
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-1/3 rounded bg-gray-200" />
              <div className="h-10 w-full rounded bg-gray-200" />
              <div className="h-24 w-full rounded bg-gray-200" />
              <div className="h-10 w-1/4 rounded bg-gray-200" />
            </div>
          </section>
        ) : (
          formJson && <FormRenderer formData={formJson} />
        )}
      </main>
    </div>
  );
};

export default App;