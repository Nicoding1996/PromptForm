import React, { useState } from 'react';
import FormRenderer from './components/FormRenderer';
import type { FormData } from './components/FormRenderer';
import FileUploader from './components/FileUploader';

const App: React.FC = () => {
  const [promptText, setPromptText] = useState<string>('');
  const [formJson, setFormJson] = useState<FormData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'text' | 'file'>('text');

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

  // Convert selected image file to Base64 (without data: prefix) and mime type
  const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = String(reader.result);
          // e.g. data:image/png;base64,AAAA...
          const [prefix, b64] = result.split(',');
          const mimeType = prefix?.match(/data:(.*);base64/)?.[1] ?? file.type;
          if (!b64) return reject(new Error('Failed to read file as Base64.'));
          resolve({ base64: b64, mimeType });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleGenerateFile = async (file: File) => {
    setError(null);
    setIsLoading(true);
    try {
      let resp: Response | null = null;

      if (file.type && file.type.startsWith('image/')) {
        // Route images to the existing vision endpoint
        const { base64, mimeType } = await fileToBase64(file);
        resp = await fetch('http://localhost:3001/generate-form-from-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mimeType }),
        });
      } else {
        // Route non-images (txt, pdf, docx) to the document endpoint as multipart/form-data
        const form = new FormData();
        form.append('file', file, file.name);
        resp = await fetch('http://localhost:3001/generate-form-from-document', {
          method: 'POST',
          body: form, // Let the browser set the multipart boundary
        });
      }

      let data: unknown = null;
      try {
        data = await resp.json();
      } catch {
        // ignore JSON parse errors; handled below
      }

      if (!resp.ok) {
        console.error('Generate form from file error', {
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
          return 'Failed to generate form from file.';
        })();
        setError(message);
        setFormJson(null);
      } else {
        setFormJson(data as FormData);
      }
    } catch (err) {
      console.error('File handling or network error:', err);
      setError('Error processing the file or contacting backend.');
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
            {mode === 'text'
              ? 'Describe the form you want to create.'
              : 'Upload a file (image, TXT, PDF, DOCX) of a form to digitize it.'}
          </p>

          <div className="mt-4 inline-flex items-center rounded-md bg-white p-1 ring-1 ring-gray-200">
            <button
              type="button"
              className={`px-3 py-1 text-sm font-medium rounded ${
                mode === 'text'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setMode('text')}
              disabled={isLoading}
            >
              From Text
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-sm font-medium rounded ${
                mode === 'file'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setMode('file')}
              disabled={isLoading}
            >
              From File
            </button>
          </div>
        </header>

        {mode === 'text' ? (
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
                className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
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
        ) : (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <FileUploader onGenerate={handleGenerateFile} isLoading={isLoading} />
            {error && (
              <p
                role="status"
                className="mt-4 rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </section>
        )}

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