import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import CommandBar from '../CommandBar';
import FormRenderer from '../FormRenderer';
import type { FormData, FormField, ResultPage } from '../FormRenderer';
import ResultCard from './ResultCard';
import OutcomeRangesAssistant from './OutcomeRangesAssistant';
import SuggestionChips from './SuggestionChips';
import { validateOutcomeRanges } from './outcomesUtils';
import { useAuth } from '../../context/AuthContext';
import UserMenu from '../ui/UserMenu';
import { Logo } from '../ui/Logo';
import { getFormById, saveFormForUser, listResponsesForForm, type StoredResponse, updateFormTheme } from '../../services/forms';
import IndividualResponsesView from '../responses/IndividualResponsesView';
import SummaryView from '../responses/SummaryView';
import { Save, ExternalLink, Loader2, Share2, Eye, ClipboardList, UserPlus, MessageSquare, HelpCircle, Sparkles, Palette } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import Card from '../ui/Card';
import StylePanel from './StylePanel';

type UnifiedEditorProps = {
  formId?: string;
};

const UnifiedEditor: React.FC<UnifiedEditorProps> = ({ formId }) => {
  // Tabs
  const [activeTab, setActiveTab] = useState<'questions' | 'responses'>('questions');

  // Builder state
  const [promptText, setPromptText] = useState<string>('');
  const [formJson, setFormJson] = useState<FormData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // API ref to focus the homepage prompt bar programmatically
  const cmdApiRef = useRef<{ focus: () => void } | null>(null);

  // Focused question index for "Implicit Edit Mode"
  const [focusedFieldIndex, setFocusedFieldIndex] = useState<number | null>(null);
  const setFocus = (index: number | null) => setFocusedFieldIndex(index);

  // Auth + Save state
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // Re-enable Save button when there are unsaved changes.
  // Any mutation to formJson means the current in-memory form differs from the last persisted version.
  // Clearing lastSavedId switches the UI from "✓ Saved!" back to an enabled "Save".
  useEffect(() => {
    setLastSavedId(null);
  }, [formJson]);

  // --- Hybrid Auto-Save (debounced) ---
  // Track latest saving/lastSavedId values inside refs to avoid stale closures.
  const savingRef = useRef<boolean>(saving);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);
  const lastSavedIdRef = useRef<string | null>(lastSavedId);
  useEffect(() => {
    lastSavedIdRef.current = lastSavedId;
  }, [lastSavedId]);

  // Debounce timer + mount guard (skip the initial hydration change).
  const autoSaveTimerRef = useRef<number | null>(null);
  const hasMountedRef = useRef<boolean>(false);

  useEffect(() => {
    // Only auto-save when editing an existing form with an authenticated user
    if (!formId || !user || !formJson) return;

    // Skip the first run triggered by initial load/hydration
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    // Debounce 2.5s after the latest change
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      // If still unsaved and not already saving, persist changes
      if (!savingRef.current && lastSavedIdRef.current === null) {
        void handleSaveForm();
      }
    }, 2500);

    // Cleanup any pending timer on re-run/unmount
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [formJson, formId, user, /* intentionally not watching lastSavedId/saving to avoid canceling timer */]);

  // AI assist in-flight indicator (index of field being generated)
  const [assistingIndex, setAssistingIndex] = useState<number | null>(null);

  // AI Refactor Engine state
  const [refactorLoading, setRefactorLoading] = useState(false);
  const [refactorError, setRefactorError] = useState<string | null>(null);
  const [isRefactoring, setIsRefactoring] = useState(false);
  // Suggest-with-AI macro action loading state
  const [suggestLoading, setSuggestLoading] = useState(false);

  // Instant AI refactor UX state
  const prevFormRef = useRef<FormData | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [changeTypes, setChangeTypes] = useState<Record<string, 'added' | 'modified'>>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lastChangeSummary, setLastChangeSummary] = useState<any>(null);

  // Responses state
  const [responses, setResponses] = useState<StoredResponse[]>([]);
  const [respLoading, setRespLoading] = useState(false);
  const [respError, setRespError] = useState<string | null>(null);
  const [responsesSubTab, setResponsesSubTab] = useState<'summary' | 'individual'>('summary');

  // Persisted AI summary for this form (loaded from Firestore)
  const [aiSummary, setAiSummary] = useState<string>('');

  // Style panel & theme state (Adaptive Theming)
  const [styleOpen, setStyleOpen] = useState<boolean>(false);
  const [themeName, setThemeName] = useState<string | null>(null);
  const [themePrimary, setThemePrimary] = useState<string | null>(null);
  const [themeBackground, setThemeBackground] = useState<string | null>(null);
  // Bind theme to CSS variables for immediate UI reflection
  const brandStyleVars = useMemo(() => {
    return themePrimary
      ? ({
          ['--pf-brand' as any]: themePrimary,
          ['--pf-brand-hover' as any]: themePrimary,
          // Make native controls (checkbox/radio/select) reflect brand immediately
          accentColor: themePrimary,
        } as React.CSSProperties)
      : undefined;
  }, [themePrimary]);

  // Ensure immediate reflection across the entire app (including portals).
  // useLayoutEffect prevents a 1-frame flash of the previous theme on navigation.
  useLayoutEffect(() => {
    try {
      if (themePrimary) {
        document.documentElement.style.setProperty('--pf-brand', themePrimary);
        document.documentElement.style.setProperty('--pf-brand-hover', themePrimary);
      } else {
        // Clear any previous brand so colors don't "stick" when navigating
        document.documentElement.style.removeProperty('--pf-brand');
        document.documentElement.style.removeProperty('--pf-brand-hover');
      }
    } catch {}
  }, [themePrimary]);

  // Reset theme immediately when navigating to another form to avoid flash/stickiness.
  // useLayoutEffect ensures the clear happens before first paint of the new route.
  useLayoutEffect(() => {
    // Clear local theme state and root CSS vars first; loader will populate real values
    setThemeName(null);
    setThemePrimary(null);
    setThemeBackground(null);
    try {
      document.documentElement.style.removeProperty('--pf-brand');
      document.documentElement.style.removeProperty('--pf-brand-hover');
    } catch {}
  }, [formId]);

  // Clear CSS brand variables when this editor unmounts, so colors don't leak to other pages
  useEffect(() => {
    return () => {
      try {
        document.documentElement.style.removeProperty('--pf-brand');
        document.documentElement.style.removeProperty('--pf-brand-hover');
      } catch {}
    };
  }, []);

  // AI prompt visibility (toggle with Sparkles)
  const location = useLocation();
  const defaultAiVisible = useMemo(() => {
    const q = new URLSearchParams(location.search);
    const ai = q.get('ai');
    return ai === '1' || ai === 'true';
  }, [location.search]);
  const [aiBarVisible, setAiBarVisible] = useState<boolean>(defaultAiVisible);
  const [aiInitDone, setAiInitDone] = useState(false);

  // Load existing form when formId is provided
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!formId) return;
      try {
        const row = await getFormById(formId);
        if (!alive) return;
        if (row?.form) setFormJson(row.form);
        // Load any saved AI summary for inline display in SummaryView
        setAiSummary((row as any)?.aiSummary || '');
        // Initialize theme state from stored doc or embedded form meta
        setThemeName((row as any)?.theme_name ?? (row as any)?.form?.theme_name ?? null);
        setThemePrimary((row as any)?.theme_primary_color ?? (row as any)?.form?.theme_primary_color ?? null);
        setThemeBackground((row as any)?.theme_background_color ?? (row as any)?.form?.theme_background_color ?? null);
      } catch {
        // ignore; keep empty builder if not found
      }
    })();
    return () => {
      alive = false;
    };
  }, [formId]);

  // Initialize AI bar visibility based on query param and whether the form was AI-generated
  useEffect(() => {
    if (aiInitDone) return;
    const q = new URLSearchParams(location.search);
    const aiParam = q.get('ai');
    if (aiParam === '0' || aiParam === 'false') {
      setAiBarVisible(false);
      setAiInitDone(true);
      return;
    }
    if ((formJson as any)?.meta?.aiGenerated) {
      setAiBarVisible(true);
      setAiInitDone(true);
      return;
    }
    // Default: leave as-is from defaultAiVisible memo
    setAiInitDone(true);
  }, [formJson, location.search, aiInitDone]);

  // Load responses when entering Responses tab
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
  
  // Callback to refresh form after theme update
  const handleThemeUpdate = async () => {
    if (!formId) return;
    try {
      const row = await getFormById(formId);
      if (row?.form) setFormJson(row.form);
      setAiSummary((row as any)?.aiSummary || '');
      setThemeName((row as any)?.theme_name ?? (row as any)?.form?.theme_name ?? null);
      setThemePrimary((row as any)?.theme_primary_color ?? (row as any)?.form?.theme_primary_color ?? null);
      setThemeBackground((row as any)?.theme_background_color ?? (row as any)?.form?.theme_background_color ?? null);
    } catch {}
  };
  
  // Click outside to unfocus (but ignore advanced editor and floating toolbar)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-adv-editor="true"]')) return;
      if (target.closest('[data-editor-toolbar="true"]')) return;
      if (target.closest('[data-type-palette="true"]')) return;
      setFocusedFieldIndex(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Derived data
  const responseColumns = useMemo(() => {
    if (!formJson) return [];
    const fields = (formJson.fields ?? []).filter((f) => f.type !== 'submit');
    return fields.map((f) => ({ key: f.name, label: f.label, field: f }));
  }, [formJson]);
 
  // Consider knowledge-quiz indicators if any field carries a correct answer or explicit answer pattern.
  const anyKnowledgeIndicators = useMemo(() => {
    const fields = (formJson?.fields ?? []) as any[];
    return fields.some((f) => {
      const ca = (f as any)?.correctAnswer;
      const hasCA =
        (typeof ca === 'string' && ca.trim().length > 0) ||
        (Array.isArray(ca) && ca.length > 0);
      const pattern = (f as any)?.answerPattern;
      const hasPattern = typeof pattern === 'string' && pattern.length > 0;
      return hasCA || hasPattern;
    });
  }, [formJson]);
 
  const quizMode =
    (formJson?.isQuiz === true) ||
    ((formJson as any)?.quizType === 'KNOWLEDGE') ||
    anyKnowledgeIndicators;

  // Compute rendered field order (non-submit first, then submit) to match FormRenderer
  const getDisplayFields = (form: FormData | null): FormField[] => {
    const raw = (form?.fields ?? []) as FormField[];
    const submit = raw.filter((f) => f.type === 'submit');
    const non = raw.filter((f) => f.type !== 'submit');
    return [...non, ...submit];
  };

  // Find the current rendered index by field.name
  const displayIndexByName = (name: string): number => {
    const list = getDisplayFields(formJson);
    return list.findIndex((f) => f.name === name);
  };

  // Click-to-focus handler used by the AI Changes popover
  const handleFocusFieldByName = (name: string) => {
    try {
      const idx = displayIndexByName(name);
      if (idx >= 0) {
        setFocus(idx);
      }
      const el = document.querySelector(`[data-anchor-id="${name}"]`) as HTMLElement | null;
      if (el && typeof (el as any).scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Re-trigger a highlight just for this field; global timer will clear after 5s
      setHighlightedFields(new Set([name]));
    } catch {
      // no-op
    }
  };

  // Step 0: Compute current max and outcome validity (independent of change)
  const currentMaxScore = useMemo(() => computeMaxPossibleScore(formJson), [formJson]);
  const outcomeValidity = useMemo(() => {
    const pages = (formJson as any)?.resultPages as ResultPage[] | undefined;
    return validateOutcomeRanges(pages ?? [], currentMaxScore);
  }, [formJson, currentMaxScore]);

  // Step 1: Detect total possible score changes (mirrors PublicFormRenderer scoring rules)
  function computeMaxPossibleScore(form: FormData | null): number {
    if (!form || form.isQuiz !== true) return 0;

    let max = 0;

    for (const f of form.fields ?? []) {
      const anyF: any = f;

      // RadioGrid: per-row maximum based on column points with ordinal fallback
      if (f.type === 'radioGrid') {
        const rows = anyF.rows ?? [];
        const cols = anyF.columns ?? [];

        const rawPoints: number[] = cols.map((c: any) => {
          if (typeof c === 'string') return NaN;
          const p = Number(c?.points);
          return Number.isFinite(p) ? p : NaN;
        });

        const allMissing = rawPoints.every((p) => !Number.isFinite(p));
        const allEqualFinite =
          rawPoints.every((p) => Number.isFinite(p)) &&
          rawPoints.every((p) => p === rawPoints[0]);

        const fallbackOrdinal = allMissing || allEqualFinite;
        const effectivePoints = (idx: number): number => {
          if (fallbackOrdinal) return idx + 1;
          const p = rawPoints[idx];
          return Number.isFinite(p) ? p : 1;
        };

        const maxColPts =
          cols.length > 0
            ? Math.max(...cols.map((_: any, i: number) => effectivePoints(i)))
            : 0;

        max += rows.length * maxColPts;
        continue;
      }

      // Gradable standard fields: include only if they have a defined correct answer/pattern
      const pointsRaw = Number(anyF.points ?? 1);
      const points = Number.isFinite(pointsRaw) ? pointsRaw : 1;

      const patternStr = anyF.answerPattern;
      const hasPattern = typeof patternStr === 'string' && patternStr.length > 0;

      let gradable = false;
      if (f.type === 'radio' || f.type === 'select') {
        gradable = hasPattern || (typeof anyF.correctAnswer === 'string' && anyF.correctAnswer.length > 0);
      } else if (f.type === 'checkbox') {
        gradable =
          hasPattern ||
          (Array.isArray(anyF.correctAnswer) && anyF.correctAnswer.length > 0) ||
          (typeof anyF.correctAnswer === 'string' && anyF.correctAnswer.length > 0);
      } else if (f.type === 'text' || f.type === 'textarea') {
        gradable = hasPattern || (typeof anyF.correctAnswer === 'string' && anyF.correctAnswer.length > 0);
      }

      if (gradable) max += points;
    }

    return max;
  }

  // Holds previous (baseline) and current computed max score
  const [scoreChange, setScoreChange] = useState<{ old: number | null; current: number; changed: boolean }>({
    old: null,
    current: 0,
    changed: false,
  });
  const [rangesAssistantOpen, setRangesAssistantOpen] = useState(false);

  // Recompute when the form changes; initialize baseline on first compute
  useEffect(() => {
    const curr = computeMaxPossibleScore(formJson);
    setScoreChange((prev) => {
      const old = prev.old ?? curr; // first run establishes baseline
      const changed = old !== curr;
      return { old, current: curr, changed };
    });
  }, [formJson]);

  // Temporary highlight cleanup after 5 seconds
  useEffect(() => {
    if (highlightedFields && highlightedFields.size > 0) {
      const t = window.setTimeout(() => setHighlightedFields(new Set()), 5000);
      return () => window.clearTimeout(t);
    }
  }, [highlightedFields]);

  // ===== In-place editor handlers =====
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
          return prev; // dropping within same block is a no-op
        }
        const block = fields.splice(start, len);

        let insertAt = newIndex;
        if (newIndex > end) insertAt = Math.max(0, newIndex - len);
        insertAt = Math.max(0, Math.min(insertAt, fields.length));

        fields.splice(insertAt, 0, ...block);
      } else {
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

  // Enhanced add field
  const handleAddField = (opts?: { afterIndex?: number | null; afterName?: string | null; type?: FormField['type'] }) => {
    const { afterIndex = null, afterName = null, type = 'text' } = opts ?? {};
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];

      // Create unique name
      const base = 'question';
      const used = new Set(fields.map((f) => f.name));
      let name = base;
      let i = 1;
      while (used.has(name)) name = `${base}_${i++}`;

      // Build new field
      let newField: FormField = { label: 'Untitled question', type, name };
      if (type === 'radio' || type === 'checkbox' || type === 'select') {
        newField = { ...newField, options: ['Option 1', 'Option 2'] };
      }

      // Compute insertion index
      let insertAt: number;

      if (afterIndex === -1) {
        insertAt = 0;
      } else if (afterName && typeof afterName === 'string') {
        const idxByName = fields.findIndex((f) => f?.name === afterName);
        if (idxByName >= 0) {
          insertAt = idxByName + 1;
        } else {
          const submitIdx = fields.findIndex((f) => f.type === 'submit');
          insertAt = submitIdx >= 0 ? submitIdx : fields.length;
        }
      } else if (afterIndex != null && Number.isFinite(afterIndex) && afterIndex >= 0) {
        // Map display index (which renders submit last) to raw array index by counting non-submit items
        let nonSubmitSeen = -1;
        let mapped = -1;
        for (let k = 0; k < fields.length; k++) {
          if (fields[k]?.type === 'submit') continue;
          nonSubmitSeen++;
          if (nonSubmitSeen === afterIndex) {
            mapped = k + 1;
            break;
          }
        }
        if (mapped >= 0) {
          insertAt = mapped;
        } else {
          const submitIdx = fields.findIndex((f) => f.type === 'submit');
          insertAt = submitIdx >= 0 ? submitIdx : fields.length;
        }
      } else {
        const submitIdx = fields.findIndex((f) => f.type === 'submit');
        insertAt = submitIdx >= 0 ? submitIdx : fields.length;
      }

      fields.splice(insertAt, 0, newField);

      // Focus the newly inserted field
      setFocusedFieldIndex(insertAt);

      return { ...prev, fields };
    });
  };

  // Form-level editors
  const handleUpdateFormTitle = (newTitle: string) => {
    setFormJson((prev) => (prev ? { ...prev, title: newTitle } : prev));
  };
  const handleUpdateFormDescription = (newDescription: string) => {
    setFormJson((prev) => (prev ? { ...prev, description: newDescription } : prev));
  };

  // Section subtitle (optional)
  const handleUpdateSectionSubtitle = (fieldIndex: number, subtitle: string) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f || f.type !== 'section') return prev;
      const s = String(subtitle || '').trim();
      const next: any = { ...f };
      if (s) next.subtitle = s;
      else delete next.subtitle;
      fields[fieldIndex] = next;
      return { ...prev, fields };
    });
  };

  // Section handling
  const handleAddSection = (opts?: { afterIndex?: number | null; afterName?: string | null }) => {
    const { afterIndex = null, afterName = null } = opts ?? {};
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const base = 'section';
      const used = new Set(fields.map((f) => f.name));
      let name = base;
      let i = 1;
      while (used.has(name)) name = `${base}_${i++}`;
      const newField: FormField = { label: 'New Section', type: 'section' as any, name };

      let insertAt: number;
      if (afterIndex === -1) {
        insertAt = 0;
      } else if (afterName && typeof afterName === 'string') {
        const idxByName = fields.findIndex((f) => f?.name === afterName);
        if (idxByName >= 0) {
          insertAt = idxByName + 1;
        } else {
          const submitIdx = fields.findIndex((f) => f.type === 'submit');
          insertAt = submitIdx >= 0 ? submitIdx : fields.length;
        }
      } else if (afterIndex != null && Number.isFinite(afterIndex) && afterIndex >= 0) {
        // Map display index to raw field index (ignoring submit)
        let nonSubmitSeen = -1;
        let mapped = -1;
        for (let k = 0; k < fields.length; k++) {
          if (fields[k]?.type === 'submit') continue;
          nonSubmitSeen++;
          if (nonSubmitSeen === afterIndex) {
            mapped = k + 1;
            break;
          }
        }
        if (mapped >= 0) {
          insertAt = mapped;
        } else {
          const submitIdx = fields.findIndex((f) => f.type === 'submit');
          insertAt = submitIdx >= 0 ? submitIdx : fields.length;
        }
      } else {
        const submitIdx = fields.findIndex((f) => f.type === 'submit');
        insertAt = submitIdx >= 0 ? submitIdx : fields.length;
      }
      fields.splice(insertAt, 0, newField);
      setFocusedFieldIndex(insertAt);
      return { ...prev, fields };
    });
  };

  // Advanced editor handlers
  const handleUpdateFieldOption = (fieldIndex: number, optionIndex: number, newText: string) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      const needsOptions = f.type === 'radio' || f.type === 'checkbox' || f.type === 'select';
      if (!needsOptions) return prev;
      const opts = f.options ? [...f.options] : [];
      if (optionIndex < 0) return prev;
      while (opts.length <= optionIndex) opts.push(`Option ${opts.length + 1}`);
      // Preserve user-entered spaces while typing; trim only if desired when saving externally
      opts[optionIndex] = newText;
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
      const opts = f.options ? [...f.options] : [];
      const label = `Option ${opts.length + 1}`;
      opts.push(label);

      const next: any = { ...f, options: opts };
      // Quiz defaults
      if (quizMode && !next.correctAnswer && opts.length > 0) next.correctAnswer = opts[0];
      if (quizMode && (next.points == null || !Number.isFinite(next.points))) next.points = 1;

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
        next.options = f.options && f.options.length ? [...f.options] : ['Option 1', 'Option 2'];
        if (quizMode) {
          if (next.correctAnswer == null && next.options && next.options.length > 0) next.correctAnswer = next.options[0];
          if (next.points == null || !Number.isFinite(next.points)) next.points = 1;
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
      const f: any = fields[fieldIndex];
      if (!f) return prev;
  
      // Determine current effective "required" from either legacy flag or validation.required
      const currentRequired = (f?.validation?.required === true) || (f?.required === true);
      const nextRequired = !currentRequired;
  
      // Write to both places for full compatibility with existing renderers
      const next: any = { ...f };
      next.required = nextRequired; // legacy/simple flag
      next.validation = { ...(f.validation || {}), required: nextRequired }; // canonical location
  
      fields[fieldIndex] = next as FormField;
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
      // Keep spaces during editing for better UX
      rows[rowIndex] = newText;
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
      const current = columns[colIndex];
      // Do not trim while typing; allow users to place spaces intentionally
      const label = newText;
      if (typeof current === 'string') {
        columns[colIndex] = { label, points: 1 };
      } else {
        columns[colIndex] = { label, points: Number.isFinite((current as any)?.points) ? (current as any).points : 1 };
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

  // Range bounds
  const handleUpdateRangeBounds = (fieldIndex: number, min: number, max: number) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;

      const next: any = { ...f };
      const minV = Number.isFinite(min) ? Math.floor(Number(min)) : (next.min ?? 0);
      const maxV = Number.isFinite(max) ? Math.floor(Number(max)) : (next.max ?? 10);

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

  // "Suggest with AI" (macro-level: append a brand new question at the end/before submit)
  const handleSuggestWithAI = async () => {
    if (!formJson || suggestLoading) return;
    setError(null);
    setSuggestLoading(true);
    try {
      const resp = await fetch('http://localhost:3001/suggest-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: formJson }),
      });
      let data: any = null;
      try {
        data = await resp.json();
      } catch {}
      if (!resp.ok) {
        const msg = (data && (data.error || data.message)) || `Suggest failed (${resp.status})`;
        throw new Error(msg);
      }
      if (!data || typeof data !== 'object') {
        throw new Error('Suggest returned invalid data.');
      }

      // Normalize and append
      const makeSnake = (s: string) =>
        String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      setFormJson((prev) => {
        if (!prev) return prev;
        const fields = [...(prev.fields ?? [])];

        // Generate unique name
        let name =
          (typeof data.name === 'string' && data.name.trim().length
            ? makeSnake(data.name)
            : makeSnake(String(data.label || 'question'))) || 'question';
        const used = new Set(fields.map((f: any) => f.name));
        if (used.has(name)) {
          const base = name || 'question';
          let i = 1;
          while (used.has(`${base}_${i}`)) i++;
          name = `${base}_${i}`;
        }

        const allowedTypes = new Set([
          'text',
          'email',
          'password',
          'textarea',
          'radio',
          'checkbox',
          'select',
          'date',
          'time',
          'file',
          'range',
          'radioGrid',
          'section',
          'submit',
        ]);
        const type = typeof data.type === 'string' && allowedTypes.has(data.type) ? data.type : 'text';

        const next: any = {
          label: String(data.label || 'New Question'),
          type,
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

        // Preserve trait-based scoring array when provided
        if (Array.isArray((data as any).scoring)) {
          next.scoring = (data as any).scoring.map((r: any) => ({
            option: typeof r?.option === 'string' ? r.option : undefined,
            column: typeof r?.column === 'string' ? r.column : undefined,
            points: Number.isFinite(Number(r?.points)) ? Math.floor(Number(r.points)) : 1,
            outcomeId: String(r?.outcomeId || ''),
          }));
        }
        // Carry over knowledge attributes only if present in response
        if (typeof (data as any).correctAnswer === 'string' || Array.isArray((data as any).correctAnswer)) {
          next.correctAnswer = (data as any).correctAnswer;
        }
        if (Number.isFinite(Number((data as any).points))) {
          next.points = Math.max(0, Math.floor(Number((data as any).points)));
        }

        // Determine context (do NOT auto-switch a normal form into quiz mode)
        const prevQuizType = (prev as any)?.quizType;
        const wasKnowledge = prevQuizType === 'KNOWLEDGE' || ((prev as any)?.isQuiz === true && prevQuizType === 'KNOWLEDGE');
        const wasOutcome = prevQuizType === 'OUTCOME' || Array.isArray((prev as any)?.resultPages);
        const aiSuggestsOutcome = Array.isArray((next as any)?.scoring) && (next as any).scoring.length > 0;
        const aiSuggestsKnowledge = typeof (data as any).correctAnswer !== 'undefined' || typeof (data as any).answerPattern === 'string';

        const isOutcomeContext = wasOutcome || aiSuggestsOutcome;
        const isKnowledgeContext = wasKnowledge || (!wasOutcome && aiSuggestsKnowledge);

        // In normal forms, strip any quiz-only keys the AI might have added
        if (!isOutcomeContext && !isKnowledgeContext) {
          delete (next as any).correctAnswer;
          delete (next as any).points;
          if (Array.isArray((next as any).scoring)) delete (next as any).scoring;
          if ((next as any).type === 'radioGrid' && Array.isArray((next as any).columns)) {
            (next as any).columns = (next as any).columns
              .map((c: any) => (typeof c === 'string' ? c : String(c?.label ?? '')))
              .filter((s: any) => typeof s === 'string' && s.length > 0);
          }
        }

        // Knowledge fallback only when truly in knowledge context
        if (isKnowledgeContext && (next.type === 'radio' || next.type === 'select' || next.type === 'checkbox')) {
          const opts = Array.isArray((next as any).options) ? (next as any).options : [];
          const hasCA =
            (typeof (next as any).correctAnswer === 'string' && String((next as any).correctAnswer).trim().length > 0) ||
            (Array.isArray((next as any).correctAnswer) && (next as any).correctAnswer.length > 0);
          if (!hasCA && opts.length > 0) {
            (next as any).correctAnswer = next.type === 'checkbox' ? [opts[0]] : opts[0];
          }
          if ((next as any).points == null || !Number.isFinite((next as any).points)) {
            (next as any).points = 1;
          }
        }

        // Insert before submit if present, otherwise push to end
        const submitIdx = fields.findIndex((f: any) => f.type === 'submit');
        const insertAt = submitIdx >= 0 ? submitIdx : fields.length;
        fields.splice(insertAt, 0, next);

        // Focus newly appended field
        setFocusedFieldIndex(insertAt);

        // Promote quiz mode ONLY when actually in quiz contexts
        const topLevelPatch =
          isOutcomeContext
            ? { isQuiz: true, quizType: 'OUTCOME' as any }
            : isKnowledgeContext
            ? {
                isQuiz: true,
                quizType: (prev as any)?.quizType === 'OUTCOME' ? 'OUTCOME' : ('KNOWLEDGE' as any),
              }
            : {};

        return { ...prev, ...topLevelPatch, fields };
      });
    } catch (e: any) {
      setError(e?.message || 'Suggest with AI failed.');
    } finally {
      setSuggestLoading(false);
    }
  };

  // AI Assist
  const handleAiAssistQuestion = async (fieldIndex: number) => {
    if (assistingIndex !== null) return;
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
      } catch {}
      if (!resp.ok) {
        const msg = (data && (data.error || data.message)) || `Assist failed (${resp.status})`;
        throw new Error(msg);
      }
      if (!data || typeof data !== 'object') {
        throw new Error('Assist returned invalid data.');
      }

      const makeSnake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      setFormJson((prev) => {
        if (!prev) return prev;
        const fields = [...prev.fields];

        let name = typeof data.name === 'string' && data.name.trim().length ? makeSnake(data.name) : makeSnake(String(data.label || 'question'));
        const used = new Set(fields.map((f) => f.name));
        if (used.has(name)) {
          const base = name || 'question';
          let i = 1;
          while (used.has(`${base}_${i}`)) i++;
          name = `${base}_${i}`;
        }

        const allowedTypes = new Set(['text','email','password','textarea','radio','checkbox','select','date','time','file','range','radioGrid']);
        const type = typeof data.type === 'string' && allowedTypes.has(data.type) ? data.type : 'text';

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
        // Carry over knowledge quiz attributes when present
        if (typeof (data as any).correctAnswer === 'string' || Array.isArray((data as any).correctAnswer)) {
          (next as any).correctAnswer = (data as any).correctAnswer as any;
        }
        if (Number.isFinite(Number((data as any).points))) {
          (next as any).points = Math.max(0, Math.floor(Number((data as any).points)));
        }

        // Determine context from existing form + AI response
        const prevQuizType = (prev as any)?.quizType;
        const wasKnowledge = prevQuizType === 'KNOWLEDGE' || ((prev as any)?.isQuiz === true && prevQuizType === 'KNOWLEDGE');
        const wasOutcome = prevQuizType === 'OUTCOME' || Array.isArray((prev as any)?.resultPages);
        const aiSuggestsOutcome = Array.isArray((next as any)?.scoring) && (next as any).scoring.length > 0;
        const aiSuggestsKnowledge = typeof (data as any).correctAnswer !== 'undefined' || typeof (data as any).answerPattern === 'string';

        const isOutcomeContext = wasOutcome || aiSuggestsOutcome;
        const isKnowledgeContext = wasKnowledge || (!wasOutcome && aiSuggestsKnowledge);

        // If not a quiz context, strip quiz-only keys to avoid flipping the editor into quiz mode
        if (!isOutcomeContext && !isKnowledgeContext) {
          delete (next as any).correctAnswer;
          delete (next as any).points;
          if (Array.isArray((next as any).scoring)) delete (next as any).scoring;
          if ((next as any).type === 'radioGrid' && Array.isArray((next as any).columns)) {
            (next as any).columns = (next as any).columns
              .map((c: any) => (typeof c === 'string' ? c : String(c?.label ?? '')))
              .filter((s: any) => typeof s === 'string' && s.length > 0);
          }
        }

        // Knowledge fallback only when truly in knowledge context
        if (isKnowledgeContext && (next.type === 'radio' || next.type === 'select' || next.type === 'checkbox')) {
          const opts = Array.isArray((next as any).options) ? (next as any).options : [];
          const hasCA =
            (typeof (next as any).correctAnswer === 'string' && String((next as any).correctAnswer).trim().length > 0) ||
            (Array.isArray((next as any).correctAnswer) && (next as any).correctAnswer.length > 0);
          if (!hasCA && opts.length > 0) {
            (next as any).correctAnswer = next.type === 'checkbox' ? [opts[0]] : opts[0];
          }
          if ((next as any).points == null || !Number.isFinite((next as any).points)) {
            (next as any).points = 1;
          }
        }
 
        fields[fieldIndex] = next;
 
        // Keep submit field last
        const submitIdx = fields.findIndex((f) => f.type === 'submit');
        if (submitIdx >= 0 && submitIdx !== fields.length - 1) {
          const [submit] = fields.splice(submitIdx, 1);
          fields.push(submit);
        }
 
        // Promote quiz mode ONLY when actually in quiz contexts
        const topLevelPatch =
          isOutcomeContext
            ? { isQuiz: true, quizType: 'OUTCOME' as any }
            : isKnowledgeContext
            ? { isQuiz: true, quizType: (prev as any)?.quizType === 'OUTCOME' ? 'OUTCOME' : ('KNOWLEDGE' as any) }
            : {};
 
        return { ...prev, ...topLevelPatch, fields };
      });
    } catch (e: any) {
      setError(e?.message || 'AI Assist failed.');
    } finally {
      setAssistingIndex(null);
    }
  };

  // Quiz mode + handlers
  const handleUpdateFieldCorrectAnswer = (fieldIndex: number, value: string | string[], opts?: { toggle?: boolean }) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      if (f.type !== 'radio' && f.type !== 'checkbox' && f.type !== 'select') return prev;

      const next: any = { ...f };

      if (f.type === 'checkbox') {
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

        if (Array.isArray(next.correctAnswer) && next.correctAnswer.length === 0) {
          delete next.correctAnswer;
        }
      } else {
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

  // Trait-based scoring updater
  const handleUpdateFieldScoring = (fieldIndex: number, scoring: any[]) => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const f = fields[fieldIndex];
      if (!f) return prev;
      const sanitized = Array.isArray(scoring)
        ? scoring.map((r: any) => ({
            ...(r?.option ? { option: String(r.option) } : {}),
            ...(r?.column ? { column: String(r.column) } : {}),
            points: Math.max(0, Math.floor(Number(r?.points) || 0)) || 1,
            outcomeId: String(r?.outcomeId || ''),
          }))
        : [];
      fields[fieldIndex] = { ...(f as any), scoring: sanitized } as any;
      return { ...prev, fields };
    });
  };

  const handleSetQuizMode = (enabled: boolean) => {
    setFormJson((prev) => {
      if (!prev) return prev;

      // When enabling, just mark quiz mode on
      if (enabled) {
        return { ...prev, isQuiz: true };
      }

      // When disabling, fully sanitize quiz artifacts so the toggle stays off:
      const next: any = { ...prev };

      // Remove top-level quiz flags and outcome config
      delete next.isQuiz;
      delete next.quizType;
      if (Array.isArray(next.resultPages)) {
        delete next.resultPages;
      }

      // Strip quiz-only keys from all fields and normalize radioGrid columns to labels-only
      next.fields = (Array.isArray(next.fields) ? next.fields : []).map((f: any) => {
        const nf: any = { ...f };
        delete nf.correctAnswer;
        delete nf.points;
        delete nf.scoring;
        delete nf.answerPattern; // prevent knowledge detection
        if (nf.type === 'radioGrid' && Array.isArray(nf.columns)) {
          nf.columns = nf.columns
            .map((c: any) => (typeof c === 'string' ? c : String(c?.label ?? '')))
            .filter((s: any) => typeof s === 'string' && s.length > 0);
        }
        return nf;
      });

      return next;
    });
  };

  // Outcomes (Result Pages)
  const handleAddResultPage = () => {
    setFormJson((prev) => {
      if (!prev) return prev;
      const pages = Array.isArray((prev as any).resultPages) ? [...((prev as any).resultPages as ResultPage[])] : [];
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
      const pages = Array.isArray((prev as any).resultPages) ? [...((prev as any).resultPages as ResultPage[])] : [];
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
      const pages = Array.isArray((prev as any).resultPages) ? [...((prev as any).resultPages as ResultPage[])] : [];
      if (index < 0 || index >= pages.length) return prev;
      pages.splice(index, 1);
      return { ...prev, resultPages: pages };
    });
  };

  // Generate via backend services (AI)
  const handleGenerate = async (promptOverride?: string) => {
    setError(null);
    const effectivePrompt = (promptOverride ?? promptText).trim();
    if (!effectivePrompt && !selectedFile) {
      setError('Please enter a prompt or attach a file.');
      return;
    }

    setIsLoading(true);
    try {
      let resp: Response | null = null;

      if (selectedFile) {
        if (selectedFile.type && selectedFile.type.startsWith('image/')) {
          const { base64, mimeType } = await fileToBase64(selectedFile);
          resp = await fetch('http://localhost:3001/generate-form-from-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: base64,
              mimeType,
              context: effectivePrompt || undefined,
            }),
          });
        } else {
          const form = new FormData();
          form.append('file', selectedFile, selectedFile.name);
          if (effectivePrompt) form.append('prompt', effectivePrompt);
          resp = await fetch('http://localhost:3001/generate-form-from-document', {
            method: 'POST',
            body: form,
          });
        }
      } else {
        resp = await fetch('http://localhost:3001/generate-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: effectivePrompt }),
        });
      }

      let data: unknown = null;
      try {
        data = await resp.json();
      } catch {}

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
        // Mark AI-first generated forms for default visibility in future sessions
        const withMeta = { ...(data as any), meta: { ...((data as any)?.meta), aiGenerated: true } } as FormData;
        setFormJson(withMeta as FormData);
        setLastSavedId(null);

        // Seamless Creation-to-Edit Flow:
        // If we're on the homepage (no formId yet) and the user is logged in,
        // auto-save the newly generated form and navigate to /form/:id/edit.
        if (!formId && user) {
          try {
            const newId = await saveFormForUser(user.uid, withMeta as FormData);
            setLastSavedId(newId);
            toast.success('Form created. Opening editor...');
            navigate(`/form/${newId}/edit?ai=1`);
          } catch (e: any) {
            const msg = e?.message || 'Auto-save failed. Please save manually.';
            toast.error(msg);
          }
        }
      }
    } catch (err) {
      setError('Network error while contacting backend.');
      setFormJson(null);
    } finally {
      setIsLoading(false);
    }
  };

  // AI Refactor Engine: apply a user command across the entire form
  const handleRefactorRequest = async (command: string) => {
    setRefactorError(null);
    if (!formJson) {
      setRefactorError('No form to refactor. Generate or open a form first.');
      return;
    }
    // Save snapshot for Undo
    prevFormRef.current = formJson;

    setIsRefactoring(true);
    setRefactorLoading(true);
    try {
      const resp = await fetch('http://localhost:3001/refactor-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formJson, command }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {}

      if (!resp.ok) {
        const message = (() => {
          if (data && typeof data === 'object') {
            const d = data as Record<string, unknown>;
            if (typeof d.error === 'string') return d.error;
            if (typeof d.message === 'string') return d.message;
          }
          return `Refactor failed (${resp.status})`;
        })();
        setRefactorError(message);
        return;
      }

      if (!data || typeof data !== 'object') {
        setRefactorError('Refactor returned invalid data.');
        return;
      }

      // Support both legacy (raw JSON) and new ({ newFormJson, changeSummary }) payloads
      let newForm: FormData | null = null;
      let changeSummary: any = null;
      if ('newFormJson' in (data as any) || 'changeSummary' in (data as any)) {
        newForm = (data as any).newFormJson ?? (data as any).form ?? null;
        changeSummary = (data as any).changeSummary ?? null;
      } else {
        newForm = data as FormData;
      }

      if (!newForm) {
        setRefactorError('Refactor returned no form JSON.');
        return;
      }

      // Apply instantly
      setFormJson(newForm as FormData);
      setLastSavedId(null);

      // Build highlight map
      const buildDiffMap = (prev: FormData | null, next: FormData | null): Record<string, 'added' | 'modified'> => {
        const map: Record<string, 'added' | 'modified'> = {};
        const prevByName = new Map((prev?.fields ?? []).map((f: any) => [f.name, f]));
        const nextByName = new Map((next?.fields ?? []).map((f: any) => [f.name, f]));
        nextByName.forEach((nf, name) => {
          const pf = prevByName.get(name);
          if (!pf) {
            map[name] = 'added';
            return;
          }
          const { name: _n1, ...a } = (pf as any) ?? {};
          const { name: _n2, ...b } = (nf as any) ?? {};
          if (JSON.stringify(a) !== JSON.stringify(b)) {
            map[name] = 'modified';
          }
        });
        return map;
      };

      let map: Record<string, 'added' | 'modified'> = {};
      if (changeSummary && (Array.isArray(changeSummary.added) || Array.isArray(changeSummary.modified))) {
        const m: Record<string, 'added' | 'modified'> = {};
        const addedArr = Array.isArray(changeSummary.added) ? changeSummary.added : [];
        const modArr = Array.isArray(changeSummary.modified) ? changeSummary.modified : [];
        for (const id of addedArr) {
          if (typeof id === 'string') m[id] = 'added';
        }
        for (const id of modArr) {
          if (typeof id === 'string') m[id] = 'modified';
        }
        map = Object.keys(m).length > 0 ? m : buildDiffMap(prevFormRef.current, newForm);
      } else {
        map = buildDiffMap(prevFormRef.current, newForm);
      }

      setChangeTypes(map);
      setHighlightedFields(new Set(Object.keys(map)));
      setLastChangeSummary(
        changeSummary || {
          added: Object.entries(map)
            .filter(([, v]) => v === 'added')
            .map(([k]) => k),
          modified: Object.entries(map)
            .filter(([, v]) => v === 'modified')
            .map(([k]) => k),
        }
      );

      // Enhanced toast (10s) with Show details + Undo
      toast.custom(
        (t) => (
          <div className="pointer-events-auto w-[320px] rounded-md bg-white p-3 shadow-lg ring-1 ring-gray-200">
            <div className="text-sm font-medium text-gray-900">Form updated</div>
            <div className="mt-1 text-xs text-gray-600">AI changes applied instantly.</div>
            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                className="text-xs font-medium text-indigo-700 hover:underline"
                onClick={() => {
                  setDetailsOpen(true);
                  toast.dismiss((t as any).id);
                }}
              >
                Show details
              </button>
              <button
                type="button"
                className="text-xs font-medium text-gray-700 hover:underline"
                onClick={() => {
                  if (prevFormRef.current) {
                    setFormJson(prevFormRef.current);
                  }
                  setChangeTypes({});
                  setHighlightedFields(new Set());
                  setDetailsOpen(false);
                  toast.dismiss((t as any).id);
                }}
              >
                Undo
              </button>
            </div>
          </div>
        ),
        { duration: 10000 }
      );
    } catch (e: any) {
      setRefactorError(e?.message || 'Network error while contacting backend.');
    } finally {
      setRefactorLoading(false);
      setIsRefactoring(false);
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

  const handleSharePublicLink = async () => {
    const id = formId || lastSavedId;
    if (!id) {
      toast.error('Save the form first to get a shareable link.');
      return;
    }
    const url = `${window.location.origin}/form/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Public link copied to clipboard!');
    } catch {
      try {
        const dummy = document.createElement('input');
        dummy.value = url;
        document.body.appendChild(dummy);
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        toast.success('Public link copied to clipboard!');
      } catch {
        toast.error('Copy failed. You can share: ' + url);
      }
    }
  };

  // Quick start templates and helpers
  const templates = [
    { icon: ClipboardList, label: 'Customer Feedback', prompt: 'A comprehensive customer feedback form for a business. Include satisfaction rating (1–5), visit frequency, and open-ended comments.' },
    { icon: UserPlus, label: 'Event Registration', prompt: 'An event registration form with Name, Email, Phone, Ticket Type, Dietary Restrictions, and Terms consent.' },
    { icon: MessageSquare, label: 'Contact Us', prompt: 'A concise contact form with Name, Email (required), Subject, and Message (textarea).' },
    { icon: HelpCircle, label: 'Quiz', prompt: 'Create a 5-question multiple-choice quiz about a topic with scoring enabled.' },
    { icon: ClipboardList, label: 'Assessment', prompt: 'An assessment form with several rating-scale questions and optional long-answer sections.' },
    { icon: HelpCircle, label: 'Personality Test', prompt: 'A personality test (Enneagram-style) that maps results to outcomes with descriptions.' },
  ];

  const handleTemplateClick = (p: string) => {
    setSelectedFile(null);
    setPromptText(p);
    // Focus the prompt bar so the user can continue typing immediately
    cmdApiRef.current?.focus();
  };

  const createBlankCanvas = async () => {
    const blank: FormData = { title: 'Untitled Form', description: '', fields: [] as any };
    setFormJson(blank);
    if (!formId && user) {
      try {
        const newId = await saveFormForUser(user.uid, blank as any);
        setLastSavedId(newId);
        navigate(`/form/${newId}/edit`);
      } catch {}
    }
  };

  // Scroll reveal for sticky header
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 0);
    onScroll(); // initialize on mount
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

    // AI toggle button styles (distinct icon-only button)
    const aiButtonClass = aiBarVisible
      ? 'inline-flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 transition-colors'
      : 'inline-flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100 transition-colors';
    const aiIconClass = aiBarVisible ? 'h-4 w-4 text-indigo-600' : 'h-4 w-4 text-neutral-600';
    const isHomepage = !formId && !formJson;
  
    // UI
  return (
    <div
      className={`min-h-screen ${isHomepage ? 'aurora-bg' : 'bg-neutral-50'}`}
      style={{
        ...(brandStyleVars || {}),
        ...(isHomepage ? {} : { background: `linear-gradient(to bottom, ${themeBackground || '#F8FAFF'} 0%, #FFFFFF 65%)` }),
      }}
    >
      <main id="form-editor-container" className="app-container pt-0 flex flex-col gap-6">
        <header
          className={`sticky top-0 z-50 -mx-[calc(50vw-50%)] px-0 py-4 transition-colors duration-200 ${
            isScrolled ? 'bg-white/85 backdrop-blur-sm border-b border-neutral-200/80' : 'bg-transparent'
          }`}
        >
          <div className="px-4 sm:px-8 lg:px-10 grid grid-cols-2 md:grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2">
            <div className="justify-self-start flex items-center gap-4">
              <Link to="/" aria-label="Home" className="inline-flex items-center">
                <Logo className="h-10 w-auto sm:h-12" />
              </Link>
            </div>

            <div className="justify-self-center col-span-2 md:col-span-1 order-3 md:order-none w-full flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            {user && formJson && formId && (
              <>
                <button
                  type="button"
                  onClick={handleSaveForm}
                  disabled={saving || !!lastSavedId}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                  title="Save this form"
                >
                  <span className="inline-flex items-center gap-1">
                    {!saving ? <Save className="h-4 w-4" /> : null} Save
                  </span>
                </button>
                <span aria-live="polite" className="ml-2 text-xs md:text-sm text-neutral-600">
                  {saving ? 'Saving...' : lastSavedId ? '✓ Saved!' : 'Unsaved changes'}
                </span>
              </>
            )}

            {lastSavedId && (
              <Link
                to={`/form/${lastSavedId}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                title="Open the public link for this form"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" /> View
                </span>
              </Link>
            )}

            {(formId || lastSavedId) && (
              <>
                <button
                  type="button"
                  onClick={handleSharePublicLink}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                  title="Copy public link"
                >
                  <span className="inline-flex items-center gap-1">
                    <Share2 className="h-4 w-4" /> Share
                  </span>
                </button>

                <Link
                  to={`/form/${formId || lastSavedId}?preview=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                  title="Open public preview in a new tab"
                >
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-4 w-4" /> Preview
                  </span>
                </Link>
              </>
            )}

            {(formId || formJson) && (
              <button
                type="button"
                onClick={() => setAiBarVisible((v) => !v)}
                className={aiButtonClass}
                title={aiBarVisible ? 'Hide AI bar' : 'Show AI bar'}
                aria-pressed={aiBarVisible}
              >
                <Sparkles className={aiIconClass} />
              </button>
            )}

            {/* Style (theme) button */}
            {formId ? (
              <button
                type="button"
                onClick={() => setStyleOpen(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                title="Style"
                aria-label="Style panel"
              >
                <Palette className="h-4 w-4 text-indigo-600" />
                <span>Style</span>
              </button>
            ) : null}

          </div>
          <div className="justify-self-end order-2 md:order-none flex items-center gap-2 sm:gap-3">
            {user && <Link to="/dashboard" className="text-sm font-medium text-neutral-700 hover:text-primary-600">Forms</Link>}
            <UserMenu />
          </div>
          </div>
        </header>

        {/* Homepage hero vs editor */}
        {!formId && !formJson ? (
          <section className="mx-auto w-full max-w-4xl py-4">
            <div className="flex flex-col items-center text-center">
              <h1 className="text-4xl font-bold text-neutral-800">Effortless forms, powered by AI.</h1>
              <p className="mt-2 text-lg text-neutral-600">Describe the form you need, or start with a template. Our AI will handle the rest.</p>

              <div className="mt-8 w-full md:w-4/5 mx-auto">
                <CommandBar
                  prompt={promptText}
                  onPromptChange={setPromptText}
                  file={selectedFile}
                  onFileChange={setSelectedFile}
                  isLoading={isLoading || refactorLoading}
                  mode="creation"
                  getApi={(api) => { cmdApiRef.current = api; }}
                  onSend={() => {
                    handleGenerate();
                  }}
                />
              </div>

              <div className="mt-8 w-full md:w-4/5 mx-auto text-left">
                <h3 className="text-sm font-medium text-neutral-500">Or start with an idea</h3>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {templates.map((t, i) => {
                    const Icon = t.icon as any;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleTemplateClick(t.prompt)}
                        className="w-full rounded-lg bg-white border border-neutral-200 shadow-sm p-4 text-left inline-flex items-center gap-3 transition-all hover:shadow-md hover:-translate-y-1"
                      >
                        <Icon className="h-5 w-5 text-neutral-700" />
                        <span className="text-sm font-medium text-neutral-800">{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-8 text-sm text-neutral-500">
                  or{' '}
                  <button type="button" onClick={createBlankCanvas} className="underline-offset-4 hover:underline">
                    <span className="text-primary-600 font-medium">start from a blank canvas</span>
                  </button>
                </p>
              </div>
            </div>
          </section>
        ) : (
          <>
            {saveError && <div className="text-xs text-red-600">{saveError}</div>}

            <Card className="p-2">
              {formId && (
                <div className="mb-4 flex items-center gap-2" role="tablist" aria-label="Editor tabs">
                  <button
                    id="tab-questions"
                    role="tab"
                    aria-controls="panel-questions"
                    type="button"
                    onClick={() => setActiveTab('questions')}
                    className={
                      'rounded-md px-3 py-1.5 text-sm font-medium ' +
                      (activeTab === 'questions' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                    }
                    style={activeTab === 'questions' ? { backgroundColor: 'var(--pf-brand, #4F46E5)' } : undefined}
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
                      (activeTab === 'responses' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                    }
                    style={activeTab === 'responses' ? { backgroundColor: 'var(--pf-brand, #4F46E5)' } : undefined}
                    aria-selected={activeTab === 'responses'}
                  >
                    Responses
                  </button>
                </div>
              )}

              {activeTab === 'questions' ? (
                <div id="panel-questions" role="tabpanel" aria-labelledby="tab-questions" className="space-y-8" tabIndex={0}>
                  <AnimatePresence initial={false}>
                    {aiBarVisible && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CommandBar
                          prompt={promptText}
                          onPromptChange={setPromptText}
                          file={selectedFile}
                          onFileChange={setSelectedFile}
                          isLoading={isLoading || refactorLoading}
                          mode={formId ? 'editing' : 'creation'}
                          getApi={(api) => {
                            // Allow external buttons (suggestion chips) to paste text and focus the input
                            cmdApiRef.current = api;
                          }}
                          onSend={() => {
                            if (formId) {
                              const cmd = promptText.trim();
                              if (cmd) {
                                handleRefactorRequest(cmd);
                              }
                            } else {
                              handleGenerate();
                            }
                          }}
                        />

                        {formId && (
                          <div className="pl-12 pr-12 mt-2 mb-3">
                            <SuggestionChips
                              onSelect={(cmd) => {
                                // Paste the suggestion into the AI prompt bar for user review instead of executing immediately
                                setPromptText(cmd);
                                // Focus the input so the user can edit or press Send
                                cmdApiRef.current?.focus();
                              }}
                              disabled={refactorLoading || isLoading}
                            />
                            {refactorError && (
                              <p className="mt-2 rounded-md border-l-4 border-red-400 bg-red-50 p-2 text-xs text-red-700">
                                {refactorError}
                              </p>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {error && (
                    <p role="status" className="rounded-md border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700">
                      {error}
                    </p>
                  )}


                  {formId && (
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
                      {quizMode && (
                        <span className="text-xs text-gray-500">
                          Mark correct answers and assign points in each choice question. Define outcomes below.
                        </span>
                      )}
                    </div>
                  )}

                  {quizMode && scoreChange.changed && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mb-3 text-sm text-amber-900 flex items-center justify-between">
                      <div className="mr-2">
                        Total possible score changed from <strong>{scoreChange.old ?? 0}</strong> to <strong>{scoreChange.current}</strong>. Your outcome ranges may need updates.
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRangesAssistantOpen(true)}
                          className="rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                        >
                          Review & Update Ranges
                        </button>
                        <button
                          type="button"
                          onClick={() => setScoreChange((s) => ({ old: s.current, current: s.current, changed: false }))}
                          className="rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                          title="Dismiss this notice (keeps your current ranges)"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Proactive invalid-ranges banner (even if total score did not just change) */}
                  {quizMode && !outcomeValidity.valid && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 mb-3 text-sm text-red-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="mr-2">
                          <div className="font-medium">Outcome ranges need attention.</div>
                          <ul className="mt-1 list-disc pl-5 space-y-0.5">
                            {outcomeValidity.issues.slice(0, 4).map((m, i) => (
                              <li key={i}>{m}</li>
                            ))}
                            {outcomeValidity.issues.length > 4 ? <li>…and more</li> : null}
                          </ul>
                        </div>
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => setRangesAssistantOpen(true)}
                            className="rounded-md bg-white px-2 py-1 text-xs font-medium text-red-900 ring-1 ring-red-200 hover:bg-red-100"
                          >
                            Review & Update Ranges
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
                        Outcomes map total quiz score ranges to a result page (e.g., personality type). You can define a title,
                        description, and a score range for each outcome.
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
                      <div className="relative">
                        <FormRenderer
                          formData={formJson}
                          onUpdateFieldLabel={handleUpdateFieldLabel}
                          onDeleteField={handleDeleteField}
                          onReorderFields={handleReorderFields}
                          onAddField={handleAddField as any}
                          onAddSection={handleAddSection as any}
                          onAiAssistQuestion={handleAiAssistQuestion}
                          assistingIndex={assistingIndex}
                          onUpdateFormTitle={handleUpdateFormTitle}
                          onUpdateFormDescription={handleUpdateFormDescription}
                          // Advanced editor props
                          highlightMap={changeTypes}
                          highlightedSet={highlightedFields}
                          focusedFieldIndex={focusedFieldIndex}
                          setFocusedFieldIndex={setFocus}
                          onUpdateFieldOption={handleUpdateFieldOption}
                          onAddFieldOption={handleAddFieldOption}
                          onRemoveFieldOption={handleRemoveFieldOption}
                          onChangeFieldType={handleChangeFieldType}
                          onDuplicateField={handleDuplicateField}
                          onToggleRequiredField={handleToggleRequiredField}
                          // Quiz
                          quizMode={quizMode}
                          onUpdateFieldCorrectAnswer={handleUpdateFieldCorrectAnswer as any}
                          onUpdateFieldPoints={handleUpdateFieldPoints}
                          onUpdateFieldScoring={handleUpdateFieldScoring}
                          // Grid + range
                          onUpdateGridRow={handleUpdateGridRow}
                          onUpdateGridColumn={handleUpdateGridColumn}
                          onAddGridRow={handleAddGridRow}
                          onAddGridColumn={handleAddGridColumn}
                          onRemoveGridRow={handleRemoveGridRow}
                          onRemoveGridColumn={handleRemoveGridColumn}
                          onUpdateGridColumnPoints={handleUpdateGridColumnPoints}
                          onUpdateRangeBounds={handleUpdateRangeBounds}
                          onUpdateSectionSubtitle={handleUpdateSectionSubtitle}
                          // Macro-level "Suggest with AI"
                          onSuggestWithAI={handleSuggestWithAI}
                          suggestLoading={suggestLoading || isLoading || refactorLoading}
                        />

                        <AnimatePresence>
                          {isRefactoring && (
                            <motion.div
                              key="refactor-overlay"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]"
                            >
                              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div id="panel-responses" role="tabpanel" aria-labelledby="tab-responses" className="card p-4" tabIndex={0}>
                  <div className="mb-4 flex items-center gap-2" role="tablist" aria-label="Responses subtabs">
                    <button
                      id="rs-tab-summary"
                      role="tab"
                      aria-controls="rs-panel-summary"
                      type="button"
                      onClick={() => setResponsesSubTab('summary')}
                      className={
                        'rounded-md px-3 py-1.5 text-sm font-medium ' +
                        (responsesSubTab === 'summary' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                      }
                      style={responsesSubTab === 'summary' ? { backgroundColor: 'var(--pf-brand, #4F46E5)' } : undefined}
                      aria-selected={responsesSubTab === 'summary'}
                    >
                      Summary
                    </button>
                    <button
                      id="rs-tab-individual"
                      role="tab"
                      aria-controls="rs-panel-individual"
                      type="button"
                      onClick={() => setResponsesSubTab('individual')}
                      className={
                        'rounded-md px-3 py-1.5 text-sm font-medium ' +
                        (responsesSubTab === 'individual' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                      }
                      style={responsesSubTab === 'individual' ? { backgroundColor: 'var(--pf-brand, #4F46E5)' } : undefined}
                      aria-selected={responsesSubTab === 'individual'}
                    >
                      Individual
                    </button>
                  </div>

                  {responsesSubTab === 'summary' && (
                    <div id="rs-panel-summary" role="tabpanel" aria-labelledby="rs-tab-summary" tabIndex={0}>
                      <SummaryView formId={formId} aiSummaryInitial={aiSummary} form={formJson} responses={responses} height="70vh" />
                    </div>
                  )}


                  {responsesSubTab === 'individual' && (
                    <div id="rs-panel-individual" role="tabpanel" aria-labelledby="rs-tab-individual" tabIndex={0}>
                      {!formId ? (
                        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                          <p className="text-sm text-gray-700">Save this form first to view individual responses.</p>
                        </section>
                      ) : respLoading ? (
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
                        <IndividualResponsesView form={formJson} responses={responses} columns={responseColumns as any} height="70vh" />
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </>
        )}
      </main>

      {/* Outcome Ranges Assistant Modal */}
      {quizMode && (
        <OutcomeRangesAssistant
          open={rangesAssistantOpen}
          oldMax={scoreChange.old ?? scoreChange.current}
          newMax={scoreChange.current}
          pages={(((formJson as any)?.resultPages ?? []) as ResultPage[])}
          onClose={() => setRangesAssistantOpen(false)}
          onApply={(updatedPages) => {
            setFormJson((prev) => (prev ? { ...prev, resultPages: updatedPages } : prev));
            setRangesAssistantOpen(false);
            setScoreChange((s) => ({ old: s.current, current: s.current, changed: false }));
          }}
        />
      )}
      {/* Style Panel for theme selection */}
      <StylePanel
        open={styleOpen}
        currentName={themeName as any}
        onClose={() => setStyleOpen(false)}
        onSelect={async (choice) => {
          if (!formId) {
            toast.error('Save the form first to update the theme.');
            return;
          }
          try {
            // Optimistically update local theme for immediate visual feedback
            setThemeName(choice.name);
            setThemePrimary(choice.primary);
            setThemeBackground(choice.background);
            await updateFormTheme(formId, {
              theme_name: choice.name,
              theme_primary_color: choice.primary,
              theme_background_color: choice.background,
            });
            toast.success('Theme updated');
          } catch (e) {
            toast.error('Failed to update theme.');
          } finally {
            setStyleOpen(false);
          }
        }}
        onThemeUpdate={handleThemeUpdate}
      />

      {/* Non-blocking "Show details" popover */}
      {detailsOpen && (
        <div className="fixed bottom-6 right-6 z-[60] w-80 rounded-lg bg-white shadow-lg ring-1 ring-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-900">AI changes</h3>
            <button
              type="button"
              onClick={() => setDetailsOpen(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="max-h-80 overflow-auto p-3 text-sm text-gray-800">
            {(() => {
              const sum = lastChangeSummary || {};
              const added =
                Array.isArray(sum.added)
                  ? sum.added
                  : Object.entries(changeTypes)
                      .filter(([, v]) => v === 'added')
                      .map(([k]) => k);
                const modified =
                  Array.isArray(sum.modified)
                    ? sum.modified
                    : Object.entries(changeTypes)
                      .filter(([, v]) => v === 'modified')
                      .map(([k]) => k);
              const removed = Array.isArray(sum.removed) ? sum.removed : [];

              return (
                <div className="space-y-3">
                  {added.length > 0 && (
                    <div>
                      <div className="font-medium text-green-700">Added</div>
                      <ul className="list-disc pl-5">
                        {added.map((id: any) => (
                          <li key={`ad-${String(id)}`}>
                            <button
                              type="button"
                              className="text-indigo-700 hover:underline"
                              onClick={() => handleFocusFieldByName(String(id))}
                              title="Scroll to field"
                            >
                              {String(id)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {modified.length > 0 && (
                    <div>
                      <div className="font-medium text-blue-700">Modified</div>
                      <ul className="list-disc pl-5">
                        {modified.map((id: any) => (
                          <li key={`md-${String(id)}`}>
                            <button
                              type="button"
                              className="text-indigo-700 hover:underline"
                              onClick={() => handleFocusFieldByName(String(id))}
                              title="Scroll to field"
                            >
                              {String(id)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {removed.length > 0 && (
                    <div>
                      <div className="font-medium text-gray-700">Removed</div>
                      <ul className="list-disc pl-5">
                        {removed.map((id: any) => (
                          <li key={`rm-${String(id)}`}>{String(id)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {added.length === 0 && modified.length === 0 && removed.length === 0 && (
                    <div className="text-gray-600">No detailed changes provided.</div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
};

export default UnifiedEditor;