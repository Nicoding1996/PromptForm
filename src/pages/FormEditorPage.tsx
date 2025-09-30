import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CommandBar from '../components/CommandBar';
import FormRenderer from '../components/FormRenderer';
import type { FormData, FormField } from '../components/FormRenderer';
import { useAuth } from '../context/AuthContext';
import LoginButton from '../components/LoginButton';
import { getFormById, saveFormForUser, listResponsesForForm, type StoredResponse } from '../services/forms';
import IndividualResponsesView from '../components/responses/IndividualResponsesView';
import SummaryView from '../components/responses/SummaryView';

/**
 * Unified tab-based editor similar to MS/Google Forms.
 * Tabs:
 *  - Questions: full builder (AI prompt + CommandBar + interactive FormRenderer)
 *  - Responses: placeholder (future: embed the redesigned responses viewer)
 */
const FormEditorPage: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();

  // Tabs
  const [activeTab, setActiveTab] = useState<'questions' | 'responses'>('questions');

  // Builder state (migrated/adapted from App.tsx)
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

  // Responses state for the Responses tab
  const [responses, setResponses] = useState<StoredResponse[]>([]);
  const [respLoading, setRespLoading] = useState(false);
  const [respError, setRespError] = useState<string | null>(null);
  const [responsesSubTab, setResponsesSubTab] = useState<'summary' | 'question' | 'individual'>('individual');

  // Load existing form by id (for editing)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!formId) return;
      try {
        const row = await getFormById(formId);
        if (!alive) return;
        if (row?.form) setFormJson(row.form);
      } catch {
        // ignore; keep empty builder if not found
      }
    })();
    return () => {
      alive = false;
    };
  }, [formId]);

  // Load responses when entering Responses tab or when formId changes
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!formId || activeTab !== 'responses') return;
      try {
        setRespLoading(true);
        setRespError(null);
        const rows = await listResponsesForForm(formId);
        if (!alive) return;
        setResponses(rows);
      } catch (e: any) {
        if (!alive) return;
        setRespError(e?.message || 'Failed to load responses.');
      } finally {
        if (alive) setRespLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [formId, activeTab]);

  // Derive columns from form fields (excluding submit)
  const responseColumns = useMemo(() => {
    if (!formJson) return [];
    const fields = (formJson.fields ?? []).filter((f) => f.type !== 'submit');
    return fields.map((f) => ({ key: f.name, label: f.label, field: f }));
  }, [formJson]);

  // Quiz mode derived from formJson
  const quizMode = formJson?.isQuiz === true;

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

      const next: any = { ...f, options: opts };
      // If quiz mode is on and there is no correct answer yet, default to the first option
      if (quizMode && !next.correctAnswer && opts.length > 0) {
        next.correctAnswer = opts[0];
      }
      // Ensure points exists in quiz mode
      if (quizMode && (next.points == null || !Number.isFinite(next.points))) {
        next.points = 1;
      }

      fields[fieldIndex] = next as FormField;
      return { ...prev, fields };
    });
  };

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

  const handleChangeFieldType = (fieldIndex: number, newType: FormField['type']) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
  
      const next: any = { ...f, type: newType };
  
      if (newType === 'radio' || newType === 'checkbox' || newType === 'select') {
        next.options = (f.options && f.options.length ? [...f.options] : ['Option 1', 'Option 2']);
        // Quiz-mode defaults for option-based questions
        if (quizMode) {
          if (next.correctAnswer == null && next.options && next.options.length > 0) {
            next.correctAnswer = next.options[0];
          }
          if (next.points == null || !Number.isFinite(next.points)) {
            next.points = 1;
          }
        }
      } else {
        delete next.options;
      }
  
      if (newType !== 'radioGrid') {
        delete next.rows;
        delete next.columns;
      }
  
      fields[fieldIndex] = next as FormField;
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

  // Grid + range handlers
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

  const handleUpdateRangeBounds = (fieldIndex: number, min: number, max: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'range') return prev;
      const nextMin = Number.isFinite(min) ? min : 0;
      const nextMax = Number.isFinite(max) ? max : 10;
      fields[fieldIndex] = { ...f, min: nextMin, max: nextMax } as FormField & {
        min?: number;
        max?: number;
      };
      return { ...prev, fields };
    });
  };

  // ===== Quiz mode + handlers =====
  const handleUpdateFieldCorrectAnswer = (
    fieldIndex: number,
    value: string | string[],
    opts?: { toggle?: boolean }
  ) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      if (f.type !== 'radio' && f.type !== 'checkbox' && f.type !== 'select') return prev;

      const next: any = { ...f };

      if (f.type === 'checkbox') {
        // Support multiple correct answers for checkbox by toggling membership
        const toggle = opts?.toggle === true;
        const curr = Array.isArray(next.correctAnswer)
          ? new Set<string>(next.correctAnswer as string[])
          : typeof next.correctAnswer === 'string' && next.correctAnswer
          ? new Set<string>([next.correctAnswer as string])
          : new Set<string>();

        if (toggle && typeof value === 'string') {
          if (curr.has(value)) curr.delete(value);
          else curr.add(value);
          next.correctAnswer = Array.from(curr);
        } else if (Array.isArray(value)) {
          next.correctAnswer = value;
        } else if (typeof value === 'string') {
          next.correctAnswer = [value];
        }

        // Normalize to undefined if empty
        if (Array.isArray(next.correctAnswer) && next.correctAnswer.length === 0) {
          delete next.correctAnswer;
        }
      } else {
        // radio/select: single string
        if (typeof value === 'string' && value.length) next.correctAnswer = value;
        else delete next.correctAnswer;
      }

      fields[fieldIndex] = next as FormField;
      return { ...prev, fields };
    });
  };

  const handleUpdateFieldPoints = (fieldIndex: number, points: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      const next: any = { ...f, points: Math.max(0, Math.floor(Number(points) || 0)) || 1 };
      fields[fieldIndex] = next as FormField;
      return { ...prev, fields };
    });
  };

  const handleSetQuizMode = (enabled: boolean) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      return { ...prev, isQuiz: !!enabled };
    });
  };

  // Generate via backend services (AI)
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

  // Save handler (update when formId exists, otherwise create)
  const handleSaveForm = async () => {
    if (!user || !formJson) return;
    setSaveError(null);
    setSaving(true);
    try {
      const id = await saveFormForUser(user.uid, formJson as FormData, formId);
      setLastSavedId(id);
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save form.');
    } finally {
      setSaving(false);
    }
  };

  // UI rendering
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        {/* Header with title and actions */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Form Editor</h1>
            <p className="mt-1 text-sm text-gray-600">
              Build your form and manage responses in one place.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user && formJson && (
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={saving || !!lastSavedId}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                title="Save this form"
              >
                {lastSavedId ? '✓ Saved!' : saving ? 'Saving...' : 'Save Form'}
              </button>
            )}

            {lastSavedId && (
              <Link
                to={`/form/${lastSavedId}`}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                title="Open the public link for this form"
                target="_blank"
                rel="noopener noreferrer"
              >
                View link
              </Link>
            )}

            <Link
              to="/dashboard"
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              title="Back to My Forms"
            >
              Dashboard
            </Link>

            <LoginButton />
          </div>
        </header>

        {saveError && (
          <div className="text-xs text-red-600">{saveError}</div>
        )}

        {/* Tabs */}
        <div className="rounded-lg bg-white p-2 ring-1 ring-gray-200">
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('questions')}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium ' +
                (activeTab === 'questions'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
              }
              aria-selected={activeTab === 'questions'}
            >
              Questions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('responses')}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium ' +
                (activeTab === 'responses'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
              }
              aria-selected={activeTab === 'responses'}
            >
              Responses
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'questions' ? (
            <div className="space-y-6">
              {/* CommandBar (prompt + file + send) */}
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

              {/* Quiz toggle */}
              <div className="flex items-center justify-between rounded-md bg-indigo-50/40 p-3 ring-1 ring-indigo-100">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={quizMode}
                    onChange={(e) => handleSetQuizMode(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Make this a quiz
                </label>
                {quizMode && <span className="text-xs text-gray-500">Mark correct answers and assign points in each choice question.</span>}
              </div>

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
                formJson && (
                  <FormRenderer
                    formData={formJson}
                    onUpdateFieldLabel={handleUpdateFieldLabel}
                    onDeleteField={handleDeleteField}
                    onReorderFields={handleReorderFields}
                    onAddField={handleAddField}
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
                    // Quiz
                    quizMode={quizMode}
                    onUpdateFieldCorrectAnswer={handleUpdateFieldCorrectAnswer}
                    onUpdateFieldPoints={handleUpdateFieldPoints}
                    // Grid + range
                    onUpdateGridRow={handleUpdateGridRow}
                    onUpdateGridColumn={handleUpdateGridColumn}
                    onAddGridRow={handleAddGridRow}
                    onAddGridColumn={handleAddGridColumn}
                    onRemoveGridRow={handleRemoveGridRow}
                    onRemoveGridColumn={handleRemoveGridColumn}
                    onUpdateRangeBounds={handleUpdateRangeBounds}
                  />
                )
              )}
            </div>
          ) : (
            <div className="rounded-lg p-4 ring-1 ring-gray-200">
              {/* Sub-tabs: Summary | Question | Individual */}
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResponsesSubTab('summary')}
                  className={
                    'rounded-md px-3 py-1.5 text-sm font-medium ' +
                    (responsesSubTab === 'summary'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                  }
                  aria-selected={responsesSubTab === 'summary'}
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={() => setResponsesSubTab('question')}
                  className={
                    'rounded-md px-3 py-1.5 text-sm font-medium ' +
                    (responsesSubTab === 'question'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                  }
                  aria-selected={responsesSubTab === 'question'}
                >
                  Question
                </button>
                <button
                  type="button"
                  onClick={() => setResponsesSubTab('individual')}
                  className={
                    'rounded-md px-3 py-1.5 text-sm font-medium ' +
                    (responsesSubTab === 'individual'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                  }
                  aria-selected={responsesSubTab === 'individual'}
                >
                  Individual
                </button>
              </div>

              {/* Sub-tab content */}
              {responsesSubTab === 'summary' && (
                <SummaryView form={formJson} responses={responses} height="70vh" />
              )}

              {responsesSubTab === 'question' && (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-700">
                  <h2 className="text-base font-semibold text-gray-900">Question View (Coming Soon)</h2>
                  <p className="mt-1 text-gray-600">Per-question breakdown will appear here.</p>
                </div>
              )}

              {responsesSubTab === 'individual' && (
                <>
                  {respLoading ? (
                    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                      <div className="animate-pulse space-y-3">
                        <div className="h-6 w-1/3 rounded bg-gray-200" />
                        <div className="h-5 w-2/3 rounded bg-gray-200" />
                        <div className="h-5 w-1/2 rounded bg-gray-200" />
                      </div>
                    </section>
                  ) : respError ? (
                    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                      <p className="text-sm text-red-700">Error: {respError}</p>
                    </section>
                  ) : (
                    <IndividualResponsesView
                      form={formJson}
                      responses={responses}
                      columns={responseColumns as any}
                      height="70vh"
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default FormEditorPage;