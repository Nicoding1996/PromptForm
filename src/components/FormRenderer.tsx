import React, { useEffect, useRef, useState } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import {
  Trash2,
  Copy,
  CheckCircle2,
  Zap,
  Loader2,
  PlusCircle,
  Heading2,
  Type as IconType,
  AlignLeft,
  CheckSquare,
  List,
  Calendar,
  Clock,
  Upload,
  Sliders,
  Grid3x3,
  CircleDot,
} from 'lucide-react';
import QuestionCard from './editor/QuestionCard';
import Button from './ui/Button';



export interface FormField {
  label: string;
  type:
    | 'text'
    | 'email'
    | 'password'
    | 'textarea'
    | 'radio'
    | 'checkbox'
    | 'select'
    | 'date'
    | 'time'
    | 'file'
    | 'range'
    | 'radioGrid'
    | 'section'
    | 'submit';
  name: string;
  options?: string[]; // required for radio | checkbox | select

  // Optional per-section subtitle (for type === 'section')
  subtitle?: string;
  
  // Quiz-related (supports single or multiple correct answers for checkbox)
  correctAnswer?: string | string[];
  points?: number;
  
  // radioGrid-specific structure:
  rows?: string[]; // array of row labels/questions
  // Supports legacy string[] and new detailed objects { label, points }
  columns?: (string | { label: string; points?: number })[]; // array of column choices
}

export interface ResultPage {
  title: string;
  description: string;
  scoreRange?: { from: number; to: number };
}

export interface FormData {
  title: string;
  description?: string;
  isQuiz?: boolean;
  fields: FormField[];
  resultPages?: ResultPage[];
}

interface FormRendererProps {
  formData: FormData | null;
  onUpdateFieldLabel: (index: number, newLabel: string) => void;
  onDeleteField: (index: number) => void;
  onReorderFields: (oldIndex: number, newIndex: number) => void;
  onAddField: () => void;
  onAddSection?: () => void;
  onAiAssistQuestion?: (index: number) => void;
  assistingIndex?: number | null;
  
  // Form-level edits
  onUpdateFormTitle: (newTitle: string) => void;
  onUpdateFormDescription: (newDescription: string) => void;
  
  // Implicit edit mode focus
  focusedFieldIndex: number | null;
  setFocusedFieldIndex: (index: number | null) => void;
  
  // Advanced editor handlers
  onUpdateFieldOption: (fieldIndex: number, optionIndex: number, newText: string) => void;
  onAddFieldOption: (fieldIndex: number) => void;
  onChangeFieldType: (fieldIndex: number, newType: FormField['type']) => void;
  onDuplicateField: (fieldIndex: number) => void;
  onToggleRequiredField: (fieldIndex: number) => void;
  
  // Quiz mode and related handlers
  quizMode?: boolean;
  onUpdateFieldCorrectAnswer?: (fieldIndex: number, value: string) => void;
  onUpdateFieldPoints?: (fieldIndex: number, points: number) => void;
  
  // Remove handlers
  onRemoveFieldOption: (fieldIndex: number, optionIndex: number) => void;
  
  // Grid editing
  onUpdateGridRow: (fieldIndex: number, rowIndex: number, newText: string) => void;
  onUpdateGridColumn: (fieldIndex: number, colIndex: number, newText: string) => void;
  onAddGridRow: (fieldIndex: number) => void;
  onAddGridColumn: (fieldIndex: number) => void;
  onRemoveGridRow: (fieldIndex: number, rowIndex: number) => void;
  onRemoveGridColumn: (fieldIndex: number, colIndex: number) => void;
  onUpdateGridColumnPoints: (fieldIndex: number, colIndex: number, newPoints: number) => void;
  
  // Range editing
  onUpdateRangeBounds: (fieldIndex: number, min: number, max: number) => void;
  
  // Section editing
  onUpdateSectionSubtitle?: (fieldIndex: number, subtitle: string) => void;
}


const baseLabelClass = 'text-sm font-medium text-gray-700';

// Normalization helper (case/whitespace tolerant)
const normalize = (v: any) => String(v ?? '').trim().toLowerCase();

// Build tolerant set of correct answers for highlighting and default selection
export function resolveCorrectSet(field: any, options: string[]): Set<string> {
  const set = new Set<string>();
  const pushIfMatch = (token: any) => {
    const t = normalize(token);
    if (!t) return;
    // Index tokens
    const idx = Number(t);
    if (Number.isInteger(idx) && idx >= 0 && idx < options.length) {
      set.add(normalize(options[idx]));
      return;
    }
    // Exact match to an option
    const direct = options.find((o) => normalize(o) === t);
    if (direct) {
      set.add(normalize(direct));
      return;
    }
    // Partial containment fallback
    const partial = options.find((o) => normalize(o).includes(t) || t.includes(normalize(o)));
    if (partial) {
      set.add(normalize(partial));
    }
  };

  const raw = field?.correctAnswer;
  if (Array.isArray(raw)) {
    raw.forEach(pushIfMatch);
  } else if (typeof raw === 'string') {
    raw.split(',').forEach(pushIfMatch);
  } else if (raw != null) {
    pushIfMatch(raw);
  }
  return set;
}

/**
 * Range field with visible numeric output.
 * Isolated component so hooks usage is valid (not inside a loop).
 */
export const RangeField: React.FC<{
  id: string;
  name: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  className?: string;
}> = ({ id, name, min = 0, max = 10, defaultValue = 5, className }) => {
  const [value, setValue] = useState<number>(defaultValue);
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        id={id}
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className={className}
      />
      <output htmlFor={id} className="min-w-[40px] text-center text-sm font-semibold text-gray-700">
        {value}
      </output>
    </div>
  );
};

/**
 * Editable label that toggles between read and edit views.
 */
export const EditableLabel: React.FC<{
  label: string;
  htmlFor: string;
  className?: string;
  onCommit: (newLabel: string) => void;
}> = ({ label, htmlFor, className = baseLabelClass, onCommit }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(label);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== label) onCommit(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setText(label);
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    );
  }

  return (
    <label className={`${className} cursor-text`} htmlFor={htmlFor} title="Click to edit label" onClick={() => setEditing(true)}>
      {label}
    </label>
  );
};

/**
 * Advanced editor view for a focused field.
 */
export const AdvancedEditor: React.FC<{
  field: FormField;
  index: number;

  assistingIndex?: number | null;
  onAiAssistQuestion?: (index: number) => void;

  onUpdateFieldLabel: (index: number, newLabel: string) => void;
  onUpdateFieldOption: (fieldIndex: number, optionIndex: number, newText: string) => void;
  onAddFieldOption: (fieldIndex: number) => void;
  onChangeFieldType: (fieldIndex: number, newType: FormField['type']) => void;
  onDuplicateField: (fieldIndex: number) => void;
  onToggleRequiredField: (fieldIndex: number) => void;

  // Quiz
  quizMode?: boolean;
  onUpdateFieldCorrectAnswer?: (fieldIndex: number, value: string) => void;
  onUpdateFieldPoints?: (fieldIndex: number, points: number) => void;

  // Remove handlers
  onRemoveFieldOption: (fieldIndex: number, optionIndex: number) => void;

  // Grid + range
  onUpdateGridRow: (fieldIndex: number, rowIndex: number, newText: string) => void;
  onUpdateGridColumn: (fieldIndex: number, colIndex: number, newText: string) => void;
  onAddGridRow: (fieldIndex: number) => void;
  onAddGridColumn: (fieldIndex: number) => void;
  onRemoveGridRow: (fieldIndex: number, rowIndex: number) => void;
  onRemoveGridColumn: (fieldIndex: number, colIndex: number) => void;
  onUpdateGridColumnPoints: (fieldIndex: number, colIndex: number, newPoints: number) => void;
  onUpdateRangeBounds: (fieldIndex: number, min: number, max: number) => void;

  // Section
  onUpdateSectionSubtitle?: (fieldIndex: number, subtitle: string) => void;
}> = ({
  field,
  index,
  assistingIndex,
  onAiAssistQuestion,
  onUpdateFieldLabel,
  onUpdateFieldOption,
  onAddFieldOption,
  onChangeFieldType,
  onDuplicateField,
  onToggleRequiredField,
  quizMode,
  onUpdateFieldCorrectAnswer,
  onUpdateFieldPoints,
  onRemoveFieldOption,
  onUpdateGridRow,
  onUpdateGridColumn,
  onUpdateGridColumnPoints,
  onAddGridRow,
  onAddGridColumn,
  onRemoveGridRow,
  onRemoveGridColumn,
  onUpdateRangeBounds,
  onUpdateSectionSubtitle,
}) => {
  const optionTypes: FormField['type'][] = [
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
  ];
  const needsOptions = field.type === 'radio' || field.type === 'checkbox' || field.type === 'select';
  const options = field.options ?? [];

  const rmin = (field as any).min ?? 0;
  const rmax = (field as any).max ?? 10;

  const correctSet = quizMode ? resolveCorrectSet(field, options) : new Set<string>();
  const isAssisting = assistingIndex === index;

  return (
    <div className="flex flex-col gap-4 rounded-md bg-indigo-50/20 p-3 ring-1 ring-indigo-100" data-adv-editor="true">
      {/* Label editor (WYSIWYG-like) + AI Assist */}
      <div className="flex items-center gap-2">
        <EditableLabel
          label={field.label}
          htmlFor={field.name}
          onCommit={(txt) => onUpdateFieldLabel(index, txt)}
        />
        <button
          type="button"
          title={isAssisting ? 'Generating…' : 'AI Assist'}
          aria-label={isAssisting ? 'Generating…' : 'AI Assist for this question'}
          aria-busy={isAssisting}
          disabled={isAssisting}
          onClick={() => !isAssisting && onAiAssistQuestion?.(index)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isAssisting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        </button>
      </div>

      {/* Section subtitle field */}
      {field.type === 'section' && (
        <input
          placeholder="Optional subtitle"
          defaultValue={(field as any).subtitle ?? ''}
          onBlur={(e) => onUpdateSectionSubtitle?.(index, e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      )}
  
      {/* Type switcher + duplicate + required */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-gray-600">Type</label>
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          value={field.type}
          onChange={(e) => onChangeFieldType(index, e.target.value as FormField['type'])}
        >
          {optionTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
  
        <button
          type="button"
          onClick={() => onDuplicateField(index)}
          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-sm text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          title="Duplicate question"
          aria-label="Duplicate question"
        >
          <Copy className="h-4 w-4" /> Duplicate
        </button>
  
        {field.type !== 'section' && (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={(field as any).required === true}
              onChange={() => onToggleRequiredField(index)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Required
          </label>
        )}
      </div>

      {/* Options editor for radio/checkbox/select */}
      {needsOptions && (
        <div className="space-y-2">
          {options.map((opt, optIdx) => {
            const isCorrect = correctSet.has(normalize(opt));
            return (
              <div
                key={`${field.name}-opt-edit-${optIdx}`}
                className={'flex items-center gap-2 ' + (isCorrect ? 'rounded bg-green-50 px-2 ring-1 ring-green-200' : '')}
              >
                <input
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={opt}
                  onChange={(e) => onUpdateFieldOption(index, optIdx, e.target.value)}
                />
                {quizMode && (
                  <button
                    type="button"
                    aria-label="Mark as correct"
                    title={isCorrect ? 'Correct answer' : 'Mark as correct'}
                    onClick={() => {
                      if (field.type === 'checkbox') {
                        (onUpdateFieldCorrectAnswer as any)?.(index, opt, { toggle: true });
                      } else {
                        onUpdateFieldCorrectAnswer?.(index, opt as any);
                      }
                    }}
                    className={
                      'inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ' +
                      (isCorrect ? 'text-green-700 ring-green-300 bg-green-100' : 'text-gray-500 ring-gray-200 hover:bg-gray-50')
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove option"
                  title="Remove option"
                  onClick={() => onRemoveFieldOption(index, optIdx)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 ring-1 ring-red-200"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => onAddFieldOption(index)}
            className="text-sm font-medium text-indigo-700 hover:underline"
          >
            + Add option
          </button>

          {/* Quiz controls */}
          {quizMode && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {field.type !== 'checkbox' ? (
                <>
                  <label className="text-xs font-medium text-gray-600">Correct answer</label>
                  <select
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    value={options.find((o) => normalize(o) === normalize(field.correctAnswer)) || ''}
                    onChange={(e) => onUpdateFieldCorrectAnswer?.(index, e.target.value as any)}
                  >
                    <option value="">-- none --</option>
                    {options.map((opt, i) => (
                      <option key={`${field.name}-correct-${i}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="text-xs text-gray-600">
                  Multiple correct allowed: click the green check icons to toggle.
                </span>
              )}
              <label className="ml-2 text-xs font-medium text-gray-600">Points</label>
              <input
                type="number"
                min={0}
                defaultValue={(field as any).points ?? 1}
                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  onUpdateFieldPoints?.(index, Number.isFinite(n) ? n : (field as any).points ?? 1);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* RadioGrid editor: editable rows/columns */}
      {field.type === 'radioGrid' && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-gray-600">Columns</div>
            <div className="flex flex-wrap gap-2">
              {(field.columns ?? []).map((col, cIdx) => {
                const label = typeof col === 'string' ? col : col?.label ?? '';
                const pts = typeof col === 'string' ? 1 : (Number.isFinite((col as any)?.points) ? (col as any).points : 1);
                return (
                  <div key={`${field.name}-col-edit-${cIdx}`} className="flex items-center gap-2">
                    <input
                      className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={label}
                      onChange={(e) => onUpdateGridColumn(index, cIdx, e.target.value)}
                    />
                    {quizMode && (
                      <>
                        <label className="text-xs text-gray-600">pts</label>
                        <input
                          type="number"
                          min={0}
                          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                          value={pts}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            onUpdateGridColumnPoints?.(index, cIdx, Number.isFinite(n) ? n : pts);
                          }}
                        />
                      </>
                    )}
                    <button
                      type="button"
                      aria-label="Remove column"
                      title="Remove column"
                      onClick={() => onRemoveGridColumn(index, cIdx)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 ring-1 ring-red-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onAddGridColumn(index)}
              className="mt-2 text-sm font-medium text-indigo-700 hover:underline"
            >
              + Add column
            </button>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-gray-600">Rows</div>
            <div className="flex flex-col gap-2">
              {(field.rows ?? []).map((row, rIdx) => (
                <div key={`${field.name}-row-edit-${rIdx}`} className="flex items-center gap-2">
                  <input
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value={row}
                    onChange={(e) => onUpdateGridRow(index, rIdx, e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Remove row"
                    title="Remove row"
                    onClick={() => onRemoveGridRow(index, rIdx)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 ring-1 ring-red-200"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onAddGridRow(index)} className="mt-2 text-sm font-medium text-indigo-700 hover:underline">
              + Add row
            </button>
          </div>
        </div>
      )}

      {/* Range bounds editor */}
      {field.type === 'range' && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-600">Min</label>
          <input
            type="number"
            defaultValue={rmin}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            onBlur={(e) => {
              const minV = Number(e.target.value);
              onUpdateRangeBounds(index, Number.isFinite(minV) ? minV : rmin, rmax);
            }}
          />
          <label className="text-xs font-medium text-gray-600">Max</label>
          <input
            type="number"
            defaultValue={rmax}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            onBlur={(e) => {
              const maxV = Number(e.target.value);
              onUpdateRangeBounds(index, rmin, Number.isFinite(maxV) ? maxV : rmax);
            }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Draggable + droppable wrapper for a single field row.
 * Provides drag handle props to be applied to a handle button.
 */
export const FieldRow: React.FC<{
  id: string;
  children: React.ReactNode;
  onDragHandleReady?: (attrs: React.HTMLAttributes<any>) => React.ReactNode;
  onClick?: () => void;
}> = ({ id, children, onDragHandleReady, onClick }) => {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  
  const style: React.CSSProperties = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {};
  
  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={style}
      onClick={onClick}
      className={`group relative rounded-lg border border-gray-200 bg-white p-3 transition-shadow ${isOver ? 'ring-2 ring-indigo-400' : ''}`}
    >
      {/* Drag handle slot (appears on hover) */}
      <div className="absolute -left-3 top-3 hidden rounded-md text-gray-500 group-hover:block">
        {onDragHandleReady?.({
          ...attributes,
          ...listeners,
        })}
      </div>
      {children}
    </div>
  );
};

/**
 * Visual insertion line shown between questions.
 * Hovering this line sets the "afterIndex" for accurate insertion.
 * afterIndex = -1 means "before the first question".
 */

/** Type palette for adding questions/sections (Microsoft Forms-like) */
const TYPE_TILES: { key: FormField['type']; label: string; Icon: React.ComponentType<any> }[] = [
  { key: 'radio', label: 'Choice', Icon: CircleDot },
  { key: 'text', label: 'Text', Icon: IconType },
  { key: 'textarea', label: 'Long answer', Icon: AlignLeft },
  { key: 'checkbox', label: 'Checkboxes', Icon: CheckSquare },
  { key: 'select', label: 'Dropdown', Icon: List },
  { key: 'date', label: 'Date', Icon: Calendar },
  { key: 'time', label: 'Time', Icon: Clock },
  { key: 'file', label: 'File upload', Icon: Upload },
  { key: 'range', label: 'Rating', Icon: Sliders },
  { key: 'radioGrid', label: 'Likert / Grid', Icon: Grid3x3 },
  { key: 'section', label: 'Section', Icon: Heading2 },
];
  
const TypePalette: React.FC<{
  onPick: (t: FormField['type']) => void;
  onClose: () => void;
}> = ({ onPick, onClose }) => {
  return (
    <div
      className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
      onMouseDown={(e) => {
        // Keep focus and inline CTA stable while interacting with the palette
        e.stopPropagation();
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
      }}
    >
      {TYPE_TILES.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onMouseDown={(e) => {
            // Prevent focus/unfocus side-effects and insert immediately
            e.preventDefault();
            e.stopPropagation();
            onPick(key);
          }}
          onClick={(e) => {
            // Fallback for keyboard/assistive tech
            e.stopPropagation();
            onPick(key);
          }}
          className="flex items-center gap-2 rounded-md border border-teal-300 bg-white px-3 py-2 text-left text-sm font-medium text-teal-900 shadow-sm transition hover:bg-teal-50"
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="col-span-full justify-self-start text-sm text-gray-600 hover:underline"
      >
        Close
      </button>
    </div>
  );
};


const FormRenderer: React.FC<FormRendererProps> = ({
  formData,
  onUpdateFieldLabel,
  onDeleteField,
  onReorderFields,
  onAddField,
  onAddSection,
  onAiAssistQuestion,
  assistingIndex,
  onUpdateFormTitle,
  onUpdateFormDescription,
  focusedFieldIndex,
  setFocusedFieldIndex,
  onUpdateFieldOption,
  onAddFieldOption,
  onRemoveFieldOption,
  onChangeFieldType,
  onDuplicateField,
  onToggleRequiredField,
  // Quiz
  quizMode,
  onUpdateFieldCorrectAnswer,
  onUpdateFieldPoints,
  // Grid/range
  onUpdateGridRow,
  onUpdateGridColumn,
  onAddGridRow,
  onAddGridColumn,
  onRemoveGridRow,
  onRemoveGridColumn,
  onUpdateGridColumnPoints,
  onUpdateRangeBounds,
  // Section edit
  onUpdateSectionSubtitle,
}) => {
  // Ensure the submit field (if any) always renders last
  const rawFields: FormField[] = (formData?.fields ?? []) as FormField[];
  const submitFields = rawFields.filter((f) => f.type === 'submit');
  const nonSubmitFields = rawFields.filter((f) => f.type !== 'submit');
  const fields = [...nonSubmitFields, ...submitFields];

  // Where to open the type chooser (after which index)
  const [chooserAfter, setChooserAfter] = useState<number | null>(null);

  // Close the palette when clicking outside
  const paletteRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (chooserAfter == null) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-type-palette="true"]')) return;
      setChooserAfter(null);
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [chooserAfter]);

  const indexFromId = (id: string) => {
    const n = Number(id.replace('field-', ''));
    return Number.isFinite(n) ? n : -1;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!active?.id || !over?.id) return;
    if (active.id === over.id) return;
    const oldIndex = indexFromId(String(active.id));
    const newIndex = indexFromId(String(over.id));
    if (oldIndex >= 0 && newIndex >= 0) onReorderFields(oldIndex, newIndex);
  };

  if (!formData) return null;

  return (
    <section id="form-editor-sheet" className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-6">
        <EditableLabel
          label={formData.title}
          htmlFor="form-title"
          className="block text-xl font-semibold text-gray-900 cursor-text"
          onCommit={(t) => onUpdateFormTitle(t)}
        />
        {formData.description && (
          <EditableLabel
            label={formData.description}
            htmlFor="form-description"
            className="block mt-1 text-sm text-gray-600 cursor-text"
            onCommit={(d) => onUpdateFormDescription(d)}
          />
        )}
      </div>

      {fields.length === 0 && (
        <div className="mb-4 rounded-lg border border-dashed border-neutral-300 p-6 text-center">
          <Button type="button" variant="primary" icon={PlusCircle} onClick={() => onAddField()}>
            Add your first question
          </Button>
        </div>
      )}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="space-y-2">
          {fields.map((field, idx) => {
            const isSection = field.type === 'section';
            const sectionNumber = isSection
              ? (fields.slice(0, idx + 1).filter((f) => f.type === 'section').length)
              : (fields.slice(0, idx).filter((f) => f.type === 'section').length);

            return (
              <React.Fragment key={`${field.name}-${idx}`}>
                {/* Page separator with section number */}
                {isSection && (
                  <div className="my-6">
                    <div className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 flex items-center justify-between">
                      <span>Section {sectionNumber}</span>
                      <span className="text-gray-400">•••</span>
                    </div>
                    <div className="border-t-4 border-gray-300" />
                  </div>
                )}

                <QuestionCard
                  field={field}
                  index={idx}
                  isFocused={focusedFieldIndex === idx}
                  onFocus={setFocusedFieldIndex}
                  {...{
                    onUpdateFieldLabel,
                    onDeleteField,
                    onReorderFields,
                    onAddField,
                    onAddSection,
                    onAiAssistQuestion,
                    assistingIndex,
                    onUpdateFormTitle,
                    onUpdateFormDescription,
                    focusedFieldIndex,
                    setFocusedFieldIndex,
                    onUpdateFieldOption,
                    onAddFieldOption,
                    onRemoveFieldOption,
                    onChangeFieldType,
                    onDuplicateField,
                    onToggleRequiredField,
                    quizMode,
                    onUpdateFieldCorrectAnswer,
                    onUpdateFieldPoints,
                    onUpdateGridRow,
                    onUpdateGridColumn,
                    onAddGridRow,
                    onAddGridColumn,
                    onRemoveGridRow,
                    onRemoveGridColumn,
                    onUpdateGridColumnPoints,
                    onUpdateRangeBounds,
                    onUpdateSectionSubtitle,
                  }}
                />

                {/* Inline "Add question here" CTA under the focused question */}
                {focusedFieldIndex === idx && field.type !== 'submit' && (
                  <div className="mt-2">
                    <Button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={() => setChooserAfter(idx)}
                      variant="primary"
                      icon={PlusCircle}
                    >
                      Add new question
                    </Button>
                    {chooserAfter === idx && (
                      <div
                        ref={paletteRef}
                        data-type-palette="true"
                        className="mt-2"
                        onMouseDown={(e) => {
                          // Do not let document mousedown handlers clear focus while using the palette
                          e.stopPropagation();
                        }}
                      >
                        <TypePalette
                          onPick={(t) => {
                            const anchorName = fields[idx]?.name;
                            if (t === 'section') {
                              (onAddSection as any)({ afterIndex: idx, afterName: anchorName });
                            } else {
                              (onAddField as any)({ afterIndex: idx, afterName: anchorName, type: t });
                            }
                            setChooserAfter(null);
                          }}
                          onClose={() => setChooserAfter(null)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Section-end CTA: do not render after submit; hide if a question in this section is focused */}
                {(() => {
                  if (field.type === 'section' || field.type === 'submit') return false;
                  // Determine the section bounds for this CTA (idx is last item before a boundary or end)
                  let sectionStart = -1;
                  for (let j = idx; j >= 0; j--) {
                    if (fields[j].type === 'section') {
                      sectionStart = j;
                      break;
                    }
                  }
                  let sectionEnd = fields.length - 1;
                  for (let k = idx + 1; k < fields.length; k++) {
                    const t = fields[k].type;
                    if (t === 'section' || t === 'submit') {
                      sectionEnd = k - 1;
                      break;
                    }
                  }
                  const isBoundaryAfter =
                    idx === fields.length - 1 ||
                    (fields[idx + 1] && (fields[idx + 1].type === 'section' || fields[idx + 1].type === 'submit'));
                  const focusedInSameSection =
                    focusedFieldIndex != null &&
                    focusedFieldIndex >= sectionStart + 1 &&
                    focusedFieldIndex <= sectionEnd;

                  if (!isBoundaryAfter || focusedInSameSection) return false;

                  return (
                    <div className="mt-4">
                      <Button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={() => setChooserAfter(idx)}
                        variant="primary"
                        icon={PlusCircle}
                      >
                        Add new question
                      </Button>
                      {chooserAfter === idx && (
                        <div
                          ref={paletteRef}
                          data-type-palette="true"
                          className="mt-2"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <TypePalette
                            onPick={(t) => {
                              const anchorName = fields[idx]?.name;
                              if (t === 'section') {
                                (onAddSection as any)({ afterIndex: idx, afterName: anchorName });
                              } else {
                                (onAddField as any)({ afterIndex: idx, afterName: anchorName, type: t });
                              }
                              setChooserAfter(null);
                            }}
                            onClose={() => setChooserAfter(null)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </React.Fragment>
            );
          })}
        </div>
      </DndContext>

      {/* Removed global Add Question/Section to match requested UX */}
    </section>
  );
};

export default FormRenderer;