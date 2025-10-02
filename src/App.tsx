import React, { useEffect, useState } from 'react';
import FormRenderer from './components/FormRenderer';
import type { FormData, FormField } from './components/FormRenderer';
import CommandBar from './components/CommandBar';
import { useAuth } from './context/AuthContext';
import LoginButton from './components/LoginButton';
import { Link } from 'react-router-dom';
import { saveFormForUser } from './services/forms';
import { Save, ExternalLink, LayoutDashboard, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [promptText, setPromptText] = useState<string>('');
  const [formJson, setFormJson] = useState<FormData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Focused question index for "Implicit Edit Mode"
  const [focusedFieldIndex, setFocusedFieldIndex] = useState<number | null>(null);

  // Auth + Save state
  const { user } = useAuth();
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  // AI assist in-flight indicator (index of field being generated)
  const [assistingIndex, setAssistingIndex] = useState<number | null>(null);

  // Click-outside to exit focus mode
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (focusedFieldIndex === null) return;
      const node = e.target as HTMLElement | null;
      if (!node) return;
      const inside = node.closest?.('[data-adv-editor="true"]');
      if (!inside) setFocusedFieldIndex(null);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [focusedFieldIndex]);

  // ===== In-place editor handlers (single source of truth: formJson) =====
  const handleUpdateFieldLabel = (fieldIndex: number, newLabel: string) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      if (!fields[fieldIndex]) return prev;
      fields[fieldIndex] = { ...fields[fieldIndex], label: newLabel };
      return { ...prev, fields };
    });
  };

  const handleDeleteField = (fieldIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      if (fieldIndex < 0 || fieldIndex >= prev.fields.length) return prev;
      const fields = prev.fields.slice(0, fieldIndex).concat(prev.fields.slice(fieldIndex + 1));
      return { ...prev, fields };
    });
  };

  const handleReorderFields = (oldIndex: number, newIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      if (
        oldIndex < 0 ||
        newIndex < 0 ||
        oldIndex >= fields.length ||
        newIndex >= fields.length
      ) {
        return prev;
      }
      const [moved] = fields.splice(oldIndex, 1);
      fields.splice(newIndex, 0, moved);

      // Ensure any submit field always stays at the end
      const submitIdx = fields.findIndex((f) => f.type === 'submit');
      if (submitIdx >= 0 && submitIdx !== fields.length - 1) {
        const [submitField] = fields.splice(submitIdx, 1);
        fields.push(submitField);
      }

      return { ...prev, fields };
    });
  };

  const handleAddField = () => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const base = 'new_question';
      const used = new Set(prev.fields.map((f) => f.name));
      let name = base;
      let i = 1;
      while (used.has(name)) {
        name = `${base}_${i++}`;
      }
      const newField: FormField = { label: 'New Question', type: 'text', name };
      const fields = [...prev.fields];

      // Insert the new field before any submit field so submit remains last
      const submitIdx = fields.findIndex((f) => f.type === 'submit');
      if (submitIdx >= 0) {
        fields.splice(submitIdx, 0, newField);
      } else {
        fields.push(newField);
      }

      return { ...prev, fields };
    });
  };

  // Smart Sections: Add a new section heading
  const handleAddSection = () => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const base = 'section';
      const used = new Set(fields.map((f) => f.name));
      let name = base;
      let i = 1;
      while (used.has(name)) {
        name = `${base}_${i++}`;
      }
      const sectionField: FormField = { label: 'New Section', type: 'section' as any, name };
      const submitIdx = fields.findIndex((f) => f.type === 'submit');
      if (submitIdx >= 0) fields.splice(submitIdx, 0, sectionField);
      else fields.push(sectionField);
      return { ...prev, fields };
    });
  };

  // ===== Form-level editors =====
  const handleUpdateFormTitle = (newTitle: string) => {
    setFormJson((prev) => (prev ? { ...prev, title: newTitle } : prev));
  };
  const handleUpdateFormDescription = (newDescription: string) => {
    setFormJson((prev) => (prev ? { ...prev, description: newDescription } : prev));
  };
 
  // ===== Advanced editor handlers =====
  const handleUpdateFieldOption = (fieldIndex: number, optionIndex: number, newText: string) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      const needsOptions = f.type === 'radio' || f.type === 'checkbox' || f.type === 'select';
      if (!needsOptions) return prev;
      const opts = (f.options ? [...f.options] : []);
      if (optionIndex < 0) return prev;
      // Expand array if needed
      while (opts.length <= optionIndex) opts.push(`Option ${opts.length + 1}`);
      opts[optionIndex] = newText.trim();
      fields[fieldIndex] = { ...f, options: opts };
      return { ...prev, fields };
    });
  };

  const handleAddFieldOption = (fieldIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      const needsOptions = f.type === 'radio' || f.type === 'checkbox' || f.type === 'select';
      if (!needsOptions) return prev;
      const opts = (f.options ? [...f.options] : []);
      const label = `Option ${opts.length + 1}`;
      opts.push(label);
      fields[fieldIndex] = { ...f, options: opts };
      return { ...prev, fields };
    });
  };

  // Remove a single option for radio/checkbox/select fields
  const handleRemoveFieldOption = (fieldIndex: number, optionIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      const needsOptions = f.type === 'radio' || f.type === 'checkbox' || f.type === 'select';
      if (!needsOptions || !f.options) return prev;
      if (optionIndex < 0 || optionIndex >= f.options.length) return prev;
      const opts = f.options.slice();
      opts.splice(optionIndex, 1);
      fields[fieldIndex] = { ...f, options: opts };
      return { ...prev, fields };
    });
  };

  // Remove a row from a radioGrid field
  const handleRemoveGridRow = (fieldIndex: number, rowIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid' || !f.rows) return prev;
      if (rowIndex < 0 || rowIndex >= f.rows.length) return prev;
      const rows = f.rows.slice();
      rows.splice(rowIndex, 1);
      fields[fieldIndex] = { ...f, rows };
      return { ...prev, fields };
    });
  };

  // Remove a column from a radioGrid field
  const handleRemoveGridColumn = (fieldIndex: number, columnIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid' || !f.columns) return prev;
      if (columnIndex < 0 || columnIndex >= f.columns.length) return prev;
      const columns = f.columns.slice();
      columns.splice(columnIndex, 1);
      fields[fieldIndex] = { ...f, columns };
      return { ...prev, fields };
    });
  };

  const handleChangeFieldType = (fieldIndex: number, newType: FormField['type']) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;

      const next: FormField = { ...f, type: newType };

      // Ensure options exist for types that require them
      if (newType === 'radio' || newType === 'checkbox' || newType === 'select') {
        next.options = (f.options && f.options.length ? [...f.options] : ['Option 1', 'Option 2']);
      } else {
        // Remove options for other types
        delete next.options;
      }

      // Clean radioGrid-only keys if switching away (kept simple)
      if (newType !== 'radioGrid') {
        delete next.rows;
        delete next.columns;
      }

      fields[fieldIndex] = next;
      return { ...prev, fields };
    });
  };

  const handleDuplicateField = (fieldIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;

      const used = new Set(fields.map((x) => x.name));
      const base = `${f.name}_copy`;
      let name = base;
      let i = 1;
      while (used.has(name)) name = `${base}_${i++}`;

      const clone: FormField = { ...f, name };
      fields.splice(fieldIndex + 1, 0, clone);
      return { ...prev, fields };
    });
  };

  const handleToggleRequiredField = (fieldIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      const required = !(f as any).required;
      fields[fieldIndex] = { ...f, required } as FormField & { required?: boolean };
      return { ...prev, fields };
    });
  };

  // ===== Grid (radioGrid) editors =====
  const handleUpdateGridRow = (fieldIndex: number, rowIndex: number, newText: string) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid') return prev;
      const rows = f.rows ? [...f.rows] : [];
      while (rows.length <= rowIndex) rows.push(`Row ${rows.length + 1}`);
      rows[rowIndex] = newText.trim();
      fields[fieldIndex] = { ...f, rows };
      return { ...prev, fields };
    });
  };

  const handleUpdateGridColumn = (fieldIndex: number, colIndex: number, newText: string) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid') return prev;
      const columns = f.columns ? [...f.columns] : [];
      while (columns.length <= colIndex) columns.push(`Column ${columns.length + 1}`);
      columns[colIndex] = newText.trim();
      fields[fieldIndex] = { ...f, columns };
      return { ...prev, fields };
    });
  };

  // Per-column points for radioGrid (normalize legacy strings to {label, points})
  const handleUpdateGridColumnPoints = (fieldIndex: number, colIndex: number, newPoints: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid') return prev;
      const columns = f.columns ? [...f.columns] : [];
      while (columns.length <= colIndex) {
        const idx = columns.length;
        columns.push({ label: `Column ${idx + 1}`, points: 1 });
      }
      const current = columns[colIndex] as any;
      const points = Math.max(0, Math.floor(Number(newPoints) || 0));
      if (typeof current === 'string') {
        columns[colIndex] = { label: current, points };
      } else {
        columns[colIndex] = { label: current?.label ?? `Column ${colIndex + 1}`, points };
      }
      fields[fieldIndex] = { ...f, columns };
      return { ...prev, fields };
    });
  };

  const handleAddGridRow = (fieldIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid') return prev;
      const rows = f.rows ? [...f.rows] : [];
      rows.push(`Row ${rows.length + 1}`);
      fields[fieldIndex] = { ...f, rows };
      return { ...prev, fields };
    });
  };

  const handleAddGridColumn = (fieldIndex: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid') return prev;
      const columns = f.columns ? [...f.columns] : [];
      columns.push(`Column ${columns.length + 1}`);
      fields[fieldIndex] = { ...f, columns };
      return { ...prev, fields };
    });
  };

  // ===== Range (slider) bounds =====
  const handleUpdateRangeBounds = (fieldIndex: number, min: number, max: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'range') return prev;
      const nextMin = Number.isFinite(min) ? min : 0;
      const nextMax = Number.isFinite(max) ? max : 10;
      fields[fieldIndex] = { ...f, min: nextMin, max: nextMax } as FormField & { min?: number; max?: number };
      return { ...prev, fields };
    });
  };

  // ===== AI Assist: expand a partial question into a completed field =====
  const handleAiAssistQuestion = async (fieldIndex: number) => {
    if (assistingIndex !== null) return; // prevent concurrent requests
    setAssistingIndex(fieldIndex);
    try {
      const label = String(formJson?.fields?.[fieldIndex]?.label ?? '').trim();
      const prompt = label || 'New question';

      const resp = await fetch('http://localhost:3001/assist-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        // ignore, handled by resp.ok check
      }
      if (!resp.ok) {
        const msg = (data && (data.error || data.message)) || `Assist failed (${resp.status})`;
        throw new Error(msg);
      }
      if (!data || typeof data !== 'object') {
        throw new Error('Assist returned invalid data.');
      }

      const makeSnake = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      setFormJson((prev) => {
        if (!prev) return prev;
        const fields = [...prev.fields];

        // Unique name
        let name =
          typeof data.name === 'string' && data.name.trim().length
            ? makeSnake(data.name)
            : makeSnake(String(data.label || 'question'));
        const used = new Set(fields.map((f) => f.name));
        if (used.has(name)) {
          const base = name || 'question';
          let i = 1;
          while (used.has(`${base}_${i}`)) i++;
          name = `${base}_${i}`;
        }

        const allowedTypes = new Set([
          'text','email','password','textarea','radio','checkbox','select','date','time','file','range','radioGrid'
        ]);
        const type =
          typeof data.type === 'string' && allowedTypes.has(data.type) ? data.type : 'text';

        const next: FormField = {
          label: String(data.label || label || 'New Question'),
          type: type as any,
          name,
          ...(Array.isArray(data.options) ? { options: data.options.map(String) } : {}),
          ...(Array.isArray(data.rows) ? { rows: data.rows.map(String) } : {}),
          ...(Array.isArray(data.columns)
            ? {
                columns: data.columns.map((c: any) =>
                  typeof c === 'string'
                    ? c
                    : {
                        label: String(c?.label ?? ''),
                        points: Number.isFinite(Number(c?.points)) ? Number(c.points) : 1,
                      }
                ),
              }
            : {}),
        };

        fields[fieldIndex] = next;

        // Keep submit last
        const submitIdx = fields.findIndex((f) => f.type === 'submit');
        if (submitIdx >= 0 && submitIdx !== fields.length - 1) {
          const [submit] = fields.splice(submitIdx, 1);
          fields.push(submit);
        }

        return { ...prev, fields };
      });
    } catch (e: any) {
      setError(e?.message || 'AI Assist failed.');
    } finally {
      setAssistingIndex(null);
    }
  };
 
  const handleGenerate = async () => {
    setError(null);
    if (!promptText.trim() && !selectedFile) {
      setError('Please enter a prompt or attach a file.');
      return;
    }

    setIsLoading(true);
    try {
      let resp: Response | null = null;

      if (selectedFile) {
        if (selectedFile.type && selectedFile.type.startsWith('image/')) {
          // Image flow with context
          const { base64, mimeType } = await fileToBase64(selectedFile);
          resp = await fetch('http://localhost:3001/generate-form-from-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: base64,
              mimeType,
              context: promptText.trim() || undefined,
            }),
          });
        } else {
          // Document flow with context in multipart/form-data
          const form = new FormData();
          form.append('file', selectedFile, selectedFile.name);
          if (promptText.trim()) form.append('prompt', promptText.trim());
          resp = await fetch('http://localhost:3001/generate-form-from-document', {
            method: 'POST',
            body: form,
          });
        }
      } else {
        // Text-only flow
        resp = await fetch('http://localhost:3001/generate-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptText }),
        });
      }

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
        setLastSavedId(null);
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
 
  // Handle save form without navigation; show "✓ Saved!"
  const handleSaveForm = async () => {
    if (!user || !formJson) return;
    setSaveError(null);
    setSaving(true);
    try {
      const id = await saveFormForUser(user.uid, formJson as FormData);
      setLastSavedId(id);
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save form.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="app-container flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              PromptForm
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Describe the form you want to create. Attach a file if you want your text to transform it.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2">
            {user && formJson && (
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={saving || !!lastSavedId}
                className="btn-brand"
                title="Save this form to your account"
              >
                {lastSavedId ? (
                  '✓ Saved!'
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>{saving ? 'Saving...' : 'Save'}</span>
                  </span>
                )}
              </button>
            )}

            {lastSavedId && (
              <a
                href={`/form/${lastSavedId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
                title="Open the public link for this form"
              >
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" /> View
                </span>
              </a>
            )}

            <Link
              to="/dashboard"
              className="btn-ghost"
              title="Go to My Forms"
            >
              <span className="inline-flex items-center gap-1">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </span>
            </Link>

            <LoginButton />
          </div>

          {saveError && (
            <div className="sm:text-right text-center text-xs text-red-600">{saveError}</div>
          )}
        </header>

        <CommandBar
          prompt={promptText}
          onPromptChange={setPromptText}
          file={selectedFile}
          onFileChange={setSelectedFile}
          isLoading={isLoading}
          onSend={handleGenerate}
        />

        {error && (
          <p
            role="status"
            className="rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {/* Loading placeholder / generated form */}
        {isLoading ? (
          <section aria-label="Loading form" className="card">
            <div className="card-body animate-pulse space-y-4">
              <div className="h-6 w-1/3 rounded bg-gray-200" />
              <div className="h-10 w-full rounded bg-gray-200" />
              <div className="h-24 w-full rounded bg-gray-200" />
              <div className="h-10 w-1/4 rounded bg-gray-200" />
            </div>
          </section>
        ) : (
          formJson && (
            <FormRenderer
              formData={formJson}
              onUpdateFieldLabel={handleUpdateFieldLabel}
              onDeleteField={handleDeleteField}
              onReorderFields={handleReorderFields}
              onAddField={handleAddField}
              onAddSection={handleAddSection}
              onAiAssistQuestion={handleAiAssistQuestion}
              assistingIndex={assistingIndex}
              onUpdateFormTitle={handleUpdateFormTitle}
              onUpdateFormDescription={handleUpdateFormDescription}
              // Advanced editor props
              focusedFieldIndex={focusedFieldIndex}
              setFocusedFieldIndex={setFocusedFieldIndex}
              onUpdateFieldOption={handleUpdateFieldOption}
              onAddFieldOption={handleAddFieldOption}
              onRemoveFieldOption={handleRemoveFieldOption}
              onChangeFieldType={handleChangeFieldType}
              onDuplicateField={handleDuplicateField}
              onToggleRequiredField={handleToggleRequiredField}
              // Grid + range
              onUpdateGridRow={handleUpdateGridRow}
              onUpdateGridColumn={handleUpdateGridColumn}
              onAddGridRow={handleAddGridRow}
              onAddGridColumn={handleAddGridColumn}
              onRemoveGridRow={handleRemoveGridRow}
              onRemoveGridColumn={handleRemoveGridColumn}
              onUpdateGridColumnPoints={handleUpdateGridColumnPoints}
              onUpdateRangeBounds={handleUpdateRangeBounds}
            />
          )
        )}
      </main>
    </div>
  );
};

export default App;