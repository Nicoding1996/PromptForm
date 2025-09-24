import React, { useState } from 'react';
import './App.css';

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
    <section className="form-renderer">
      <h2>{formData.title}</h2>
      <form>
        {formData.fields.map((field, idx) => {
          const key = `${field.name}-${idx}`;
          if (field.type === 'text' || field.type === 'email') {
            return (
              <div className="form-row" key={key}>
                <label htmlFor={field.name}>{field.label}</label>
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                />
              </div>
            );
          }

          if (field.type === 'textarea') {
            return (
              <div className="form-row" key={key}>
                <label htmlFor={field.name}>{field.label}</label>
                <textarea
                  id={field.name}
                  name={field.name}
                  rows={4}
                />
              </div>
            );
          }

          if (field.type === 'radio' || field.type === 'checkbox') {
            const options = field.options ?? [];
            return (
              <div className="form-row" key={key}>
                <span className="control-label">{field.label}</span>
                <div className="options">
                  {options.map((opt, optIdx) => {
                    const optId = `${field.name}-${optIdx}`;
                    return (
                      <div className="option" key={optId}>
                        <input
                          type={field.type}
                          id={optId}
                          name={field.name}
                          value={opt}
                        />
                        <label htmlFor={optId}>{opt}</label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          if (field.type === 'submit') {
            return (
              <div className="form-row" key={key}>
                <button type="submit" className="primary">
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
    <div className="App">
      <h1>PromptForm</h1>
      <div className="prompt-input">
        <label htmlFor="promptText">Prompt</label>
        <textarea
          id="promptText"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={8}
          placeholder="Describe the form you want to generate..."
        />
      </div>

      {error && (
        <p role="status" className="status error">
          {error}
        </p>
      )}
      {isLoading && (
        <p role="status" className="status loading">Generating...</p>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isLoading}
        className="primary"
      >
        {isLoading ? 'Generating...' : 'Generate Form'}
      </button>

      <FormRenderer formData={formJson} />
    </div>
  );
};

export default App;