import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CommandBar from '../components/CommandBar';
import FormRenderer from '../components/FormRenderer';
import type { FormData, FormField, ResultPage } from '../components/FormRenderer';
import ResultCard from '../components/editor/ResultCard';
import { useAuth } from '../context/AuthContext';
import LoginButton from '../components/LoginButton';
import { getFormById, saveFormForUser, listResponsesForForm, type StoredResponse } from '../services/forms';
import IndividualResponsesView from '../components/responses/IndividualResponsesView';
import SummaryView from '../components/responses/SummaryView';
import { Save, ExternalLink, LayoutDashboard, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  // AI assist in-flight indicator (index of field being generated)
  const [assistingIndex, setAssistingIndex] = useState<number | null>(null);

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

  // Click outside to unfocus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-adv-editor="true"]')) return;
      setFocusedFieldIndex(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      const n = fields.length;
      if (oldIndex < 0 || newIndex < 0 || oldIndex >= n || newIndex >= n) return prev;

      const src = fields[oldIndex];

      // If dragging a section heading, move the whole contiguous block [section .. before next section/submit]
      if (src?.type === 'section') {
        // Determine block [start, end]
        const start = oldIndex;
        let end = n - 1;
        for (let i = start + 1; i < n; i++) {
          const t = fields[i]?.type;
          if (t === 'section' || t === 'submit') {
            end = i - 1;
            break;
          }
        }
        const len = end - start + 1;
        if (newIndex >= start && newIndex <= end) {
          // No-op if dropped inside the same block
          return prev;
        }
        const block = fields.splice(start, len);

        // Adjust insertion index after removal if original target was after the block
        let insertAt = newIndex;
        if (newIndex > end) insertAt = Math.max(0, newIndex - len);

        // Clamp
        insertAt = Math.max(0, Math.min(insertAt, fields.length));

        fields.splice(insertAt, 0, ...block);
      } else {
        // Default single-item move
        const [moved] = fields.splice(oldIndex, 1);
        fields.splice(newIndex, 0, moved);
      }

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

  // ===== Section handling =====
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
      const newField: FormField = { label: 'New Section', type: 'section' as any, name };
      // Insert before submit so submit remains last
      const submitIdx = fields.findIndex((f) => f.type === 'submit');
      if (submitIdx >= 0) fields.splice(submitIdx, 0, newField);
      else fields.push(newField);
      return { ...prev, fields };
    });
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
      // Ensure element exists
      while (columns.length <= colIndex) columns.push(`Column ${columns.length + 1}`);
      const current = columns[colIndex];
      const label = newText.trim();
      // Normalize to object { label, points }
      if (typeof current === 'string') {
        columns[colIndex] = { label, points: 1 };
      } else {
        columns[colIndex] = { label, points: Number.isFinite(current?.points as any) ? (current as any).points : 1 };
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
      const nextLabel = `Column ${columns.length + 1}`;
      columns.push({ label: nextLabel, points: 1 });
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

  const handleUpdateGridColumnPoints = (fieldIndex: number, colIndex: number, newPoints: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'radioGrid') return prev;
      const columns = f.columns ? [...f.columns] : [];
      while (columns.length <= colIndex) columns.push({ label: `Column ${columns.length + 1}`, points: 1 });
      const current = columns[colIndex];
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

// Range bounds handler (for range field min/max)
const handleUpdateRangeBounds = (fieldIndex: number, min: number, max: number) => {
  setFormJson((prev) => {
    if (!prev) return prev;
    const fields = [...prev.fields];
    const f = fields[fieldIndex];
    if (!f) return prev;

    const next: any = { ...f };
    const minV = Number.isFinite(min) ? Math.floor(Number(min)) : (next.min ?? 0);
    const maxV = Number.isFinite(max) ? Math.floor(Number(max)) : (next.max ?? 10);

    // Ensure min <= max by swapping if needed
    if (minV <= maxV) {
      next.min = minV;
      next.max = maxV;
    } else {
      next.min = maxV;
      next.max = minV;
    }

    fields[fieldIndex] = next as FormField;
    return { ...prev, fields };
  });
};

// AI Assist: replace a partial question with an AI-completed field
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
      // ignore parse error; handled by !resp.ok
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

    // Build a normalized FormField and ensure unique name
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];

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

      // Keep submit field last
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
  
  // ===== Outcomes (Result Pages) handlers =====
  const handleAddResultPage = () => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const pages = Array.isArray((prev as any).resultPages) ? [...(prev as any).resultPages as ResultPage[]] : [];
      pages.push({
        title: 'New Outcome',
        description: 'Describe this outcome...',
        scoreRange: { from: 0, to: 0 },
      });
      return { ...prev, resultPages: pages };
    });
  };
  
  const handleUpdateResultPage = (index: number, patch: Partial<ResultPage>) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const pages = Array.isArray((prev as any).resultPages) ? [...(prev as any).resultPages as ResultPage[]] : [];
      if (!pages[index]) return prev;
      const current = pages[index];
      const next: ResultPage = {
        title: patch.title ?? current.title,
        description: patch.description ?? current.description,
        scoreRange: {
          from: patch.scoreRange?.from ?? current.scoreRange?.from ?? 0,
          to: patch.scoreRange?.to ?? current.scoreRange?.to ?? 0,
        },
      };
      pages[index] = next;
      return { ...prev, resultPages: pages };
    });
  };
  
  const handleDeleteResultPage = (index: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const pages = Array.isArray((prev as any).resultPages) ? [...(prev as any).resultPages as ResultPage[]] : [];
      if (index < 0 || index >= pages.length) return prev;
      pages.splice(index, 1);
      return { ...prev, resultPages: pages };
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
      toast.success('Form saved successfully!');
    } catch (e: any) {
      const msg = e?.message || 'Failed to save form.';
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // UI rendering
  return (
    <div className="min-h-screen bg-slate-100">
      <main className="app-container flex flex-col gap-6">
        {/* Header with title and actions */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Form Editor</h1>
            <p className="mt-1 text-sm text-slate-600">
              Build your form and manage responses in one place.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user && formJson && (
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={saving || !!lastSavedId}
                className="btn-brand"
                title="Save this form"
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
              <Link
                to={`/form/${lastSavedId}`}
                className="btn-ghost"
                title="Open the public link for this form"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" /> View
                </span>
              </Link>
            )}

            <Link
              to="/dashboard"
              className="btn-ghost"
              title="Back to My Forms"
            >
              <span className="inline-flex items-center gap-1">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </span>
            </Link>

            <LoginButton />
          </div>
        </header>

        {saveError && (
          <div className="text-xs text-red-600">{saveError}</div>
        )}

        {/* Tabs */}
        <div className="card p-2">
          <div
            className="mb-4 flex items-center gap-2"
            role="tablist"
            aria-label="Editor tabs"
          >
            <button
              id="tab-questions"
              role="tab"
              aria-controls="panel-questions"
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
              id="tab-responses"
              role="tab"
              aria-controls="panel-responses"
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
            <div id="panel-questions" role="tabpanel" aria-labelledby="tab-questions" className="space-y-6" tabIndex={0}>
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
                  Enable scoring and outcomes
                </label>
                {quizMode && <span className="text-xs text-gray-500">Mark correct answers and assign points in each choice question. Define outcomes below.</span>}
              </div>
  
              {/* Outcomes / Result Pages (visible only in quiz mode) */}
              {quizMode && (
                <section className="rounded-md border border-indigo-100 bg-indigo-50/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Outcomes</h3>
                    <button
                      type="button"
                      onClick={handleAddResultPage}
                      className="rounded-md bg-white px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                    >
                      + Add an Outcome
                    </button>
                  </div>
  
                  <p className="mb-3 text-xs text-gray-600">
                    Outcomes map total quiz score ranges to a result page (e.g., personality type). You can define a title, description, and a score range for each outcome.
                  </p>
  
                  <div className="grid gap-3 md:grid-cols-2">
                    {(formJson as any)?.resultPages?.length ? (
                      (formJson as any).resultPages.map((page: ResultPage, i: number) => (
                        <ResultCard
                          key={`result-page-${i}`}
                          index={i}
                          page={page}
                          onChange={handleUpdateResultPage}
                          onDelete={handleDeleteResultPage}
                        />
                      ))
                    ) : (
                      <div className="text-xs text-gray-500">No outcomes yet. Click "Add an Outcome" to create one.</div>
                    )}
                  </div>
                </section>
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
                    onUpdateGridColumnPoints={handleUpdateGridColumnPoints}
                    onUpdateRangeBounds={handleUpdateRangeBounds}
                  />
                )
              )}
            </div>
          ) : (
            <div id="panel-responses" role="tabpanel" aria-labelledby="tab-responses" className="card p-4" tabIndex={0}>
              {/* Sub-tabs: Summary | Question | Individual */}
              <div
                className="mb-4 flex items-center gap-2"
                role="tablist"
                aria-label="Responses subtabs"
              >
                <button
                  id="rs-tab-summary"
                  role="tab"
                  aria-controls="rs-panel-summary"
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
                  id="rs-tab-question"
                  role="tab"
                  aria-controls="rs-panel-question"
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
                  id="rs-tab-individual"
                  role="tab"
                  aria-controls="rs-panel-individual"
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
                <div
                  id="rs-panel-summary"
                  role="tabpanel"
                  aria-labelledby="rs-tab-summary"
                  tabIndex={0}
                >
                  <SummaryView form={formJson} responses={responses} height="70vh" />
                </div>
              )}

              {responsesSubTab === 'question' && (
                <div
                  id="rs-panel-question"
                  role="tabpanel"
                  aria-labelledby="rs-tab-question"
                  className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-700"
                  tabIndex={0}
                >
                  <h2 className="text-base font-semibold text-gray-900">Question View (Coming Soon)</h2>
                  <p className="mt-1 text-gray-600">Per-question breakdown will appear here.</p>
                </div>
              )}

              {responsesSubTab === 'individual' && (
                <div
                  id="rs-panel-individual"
                  role="tabpanel"
                  aria-labelledby="rs-tab-individual"
                  tabIndex={0}
                >
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
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default FormEditorPage;