import React from 'react';
import { Trash2, GripVertical } from 'lucide-react';
import Button from '../ui/Button';
import type { FormField } from '../FormRenderer';
import {
  AdvancedEditor,
  EditableLabel,
  FieldRow,
  RangeField,
  resolveCorrectSet,
} from '../FormRenderer';

const baseInputClass =
  'block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';
const baseLabelClass = 'text-sm font-medium text-neutral-700';
const normalize = (v: any) => String(v ?? '').trim().toLowerCase();

type Props = {
  field: FormField;
  index: number;
  isFocused: boolean;
  onFocus: (index: number | null) => void;
  onUpdateFieldLabel: (index: number, newLabel: string) => void;
  onDeleteField: (index: number) => void;
  // ... and all the other props from FormRenderer that are needed by AdvancedEditor and the render logic
  onReorderFields: (oldIndex: number, newIndex: number) => void;
  onAddField: () => void;
  onAddSection?: () => void;
  onAiAssistQuestion?: (index: number) => void;
  assistingIndex?: number | null;
  onUpdateFormTitle: (newTitle: string) => void;
  onUpdateFormDescription: (newDescription: string) => void;
  focusedFieldIndex: number | null;
  setFocusedFieldIndex: (index: number | null) => void;
  onUpdateFieldOption: (
    fieldIndex: number,
    optionIndex: number,
    newText: string
  ) => void;
  onAddFieldOption: (fieldIndex: number) => void;
  onChangeFieldType: (fieldIndex: number, newType: FormField['type']) => void;
  onDuplicateField: (fieldIndex: number) => void;
  onToggleRequiredField: (fieldIndex: number) => void;

  // Quiz mode and types
  quizMode?: boolean;
  quizType?: 'KNOWLEDGE' | 'OUTCOME';

  // Knowledge quiz scoring
  onUpdateFieldCorrectAnswer?: (fieldIndex: number, value: string) => void;
  onUpdateFieldPoints?: (fieldIndex: number, points: number) => void;

  // Trait-based scoring (OUTCOME)
  onUpdateFieldScoring?: (fieldIndex: number, scoring: any[]) => void;
  outcomeOptions?: { id: string; title: string }[];

  onRemoveFieldOption: (fieldIndex: number, optionIndex: number) => void;
  onUpdateGridRow: (
    fieldIndex: number,
    rowIndex: number,
    newText: string
  ) => void;
  onUpdateGridColumn: (
    fieldIndex: number,
    colIndex: number,
    newText: string
  ) => void;
  onAddGridRow: (fieldIndex: number) => void;
  onAddGridColumn: (fieldIndex: number) => void;
  onRemoveGridRow: (fieldIndex: number, rowIndex: number) => void;
  onRemoveGridColumn: (fieldIndex: number, colIndex: number) => void;
  onUpdateGridColumnPoints: (
    fieldIndex: number,
    colIndex: number,
    newPoints: number
  ) => void;
  onUpdateRangeBounds: (fieldIndex: number, min: number, max: number) => void;

  // AI refactor temporary highlight status
  highlightStatus?: 'added' | 'modified' | null;
  // Set of field names currently highlighted (controls fade-out window)
  highlightedSet?: Set<string>;
};

const QuestionCard: React.FC<Props> = (props) => {
  const { field, index, isFocused, onFocus } = props;

  const labelNode = (
    <EditableLabel
      label={field.label}
      htmlFor={field.name}
      className={baseLabelClass}
      onCommit={(newLabel: string) => props.onUpdateFieldLabel(index, newLabel)}
    />
  );

  const content = (() => {
    if (field.type === 'section') {
      return (
        <div className="flex flex-col gap-2">
          <EditableLabel
            label={field.label}
            htmlFor={field.name}
            className="text-lg font-semibold text-neutral-800"
            onCommit={(newLabel: string) => props.onUpdateFieldLabel(index, newLabel)}
          />
          <hr className="border-neutral-200" />
        </div>
      );
    }

    if (
      field.type === 'text' ||
      field.type === 'email' ||
      field.type === 'password' ||
      field.type === 'date' ||
      field.type === 'time' ||
      field.type === 'file' ||
      field.type === 'range'
    ) {
      return (
        <div className="flex flex-col gap-2">
          {labelNode}
          {field.type === 'range' ? (
            <RangeField
              id={field.name}
              name={field.name}
              min={(field as any).min ?? 0}
              max={(field as any).max ?? 10}
              defaultValue={Math.floor(
                (((field as any).min ?? 0) + ((field as any).max ?? 10)) / 2
              )}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-200 accent-primary-600"
            />
          ) : (
            <input
              type={field.type}
              id={field.name}
              name={field.name}
              className={baseInputClass}
            />
          )}
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div className="flex flex-col gap-2">
          {labelNode}
          <textarea
            id={field.name}
            name={field.name}
            rows={4}
            className={baseInputClass}
          />
        </div>
      );
    }

    if (field.type === 'radio') {
      const options = field.options ?? [];
      const correctSet = props.quizMode
        ? resolveCorrectSet(field, options)
        : new Set<string>();
      return (
        <div className="flex flex-col gap-2">
          <span className={baseLabelClass}>{labelNode}</span>
          <div className="flex flex-col gap-2">
            {options.map((opt, optIdx) => {
              const optId = `${field.name}-radio-${optIdx}`;
              const isCorrect = correctSet.has(normalize(opt));
              return (
                <div
                  className={
                    'flex items-center gap-2 ' +
                    (isCorrect
                      ? 'rounded bg-green-50 px-2 ring-1 ring-green-200'
                      : '')
                  }
                  key={optId}
                >
                  <input
                    type="radio"
                    id={optId}
                    name={field.name}
                    value={opt}
                    className="h-4 w-4 border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="text-sm text-gray-700" htmlFor={optId}>
                    {opt}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (field.type === 'checkbox') {
      const options = field.options ?? [];
      const correctSet = props.quizMode
        ? resolveCorrectSet(field, options)
        : new Set<string>();
      if (options.length > 0) {
        return (
          <div className="flex flex-col gap-2">
            <span className={baseLabelClass}>{labelNode}</span>
            <div className="flex flex-col gap-2">
              {options.map((opt, optIdx) => {
                const optId = `${field.name}-check-${optIdx}`;
                const isCorrect = correctSet.has(normalize(opt));
                return (
                  <label
                    className={
                      'flex items-center gap-2 text-sm text-gray-700 ' +
                      (isCorrect
                        ? 'rounded bg-green-50 px-2 ring-1 ring-green-200'
                        : '')
                    }
                    key={optId}
                  >
                    <input
                      type="checkbox"
                      id={optId}
                      name={field.name}
                      value={opt}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            id={field.name}
            name={field.name}
            className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
          />
          <span>{labelNode}</span>
        </label>
      );
    }

    if (field.type === 'select') {
      const options = field.options ?? [];
      const correctSet = props.quizMode
        ? resolveCorrectSet(field, options)
        : new Set<string>();
      const matched = options.find((o) => correctSet.has(normalize(o))) || '';
      return (
        <div className="flex flex-col gap-2">
          {labelNode}
          <select
            id={field.name}
            name={field.name}
            className={baseInputClass}
            defaultValue={matched || ''}
          >
            <option value="" disabled>
              Select an option
            </option>
            {options.map((opt, optIdx) => (
              <option key={`${field.name}-opt-${optIdx}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'radioGrid') {
      const rows = field.rows ?? [];
      const cols = field.columns ?? [];
      return (
        <div className="flex flex-col gap-3">
          <span className={baseLabelClass}>{labelNode}</span>
          <div className="overflow-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left text-xs font-semibold text-neutral-600"></th>
                  {cols.map((col, cIdx) => {
                    const label = typeof col === 'string' ? col : col?.label ?? '';
                    return (
                      <th
                        key={`${field.name}-col-${cIdx}`}
                        className="p-2 text-xs font-semibold text-neutral-600"
                      >
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => {
                  const rowName = `${field.name}[${rIdx}]`;
                  return (
                    <tr
                      key={`${field.name}-row-${rIdx}`}
                      className="border-t border-neutral-200"
                    >
                      <th
                        scope="row"
                        className="p-2 text-left text-sm font-medium text-neutral-700"
                      >
                        {row}
                      </th>
                      {cols.map((col, cIdx) => {
                        const id = `${field.name}-${rIdx}-${cIdx}`;
                        const colLabel =
                          typeof col === 'string' ? col : col?.label ?? '';
                        return (
                          <td key={id} className="p-2 text-center">
                            <input
                              type="radio"
                              id={id}
                              name={rowName}
                              value={String(cIdx)}
                              className="h-4 w-4 border-neutral-300 text-primary-600 focus:ring-primary-500"
                              aria-label={`${row} - ${colLabel}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (field.type === 'submit') {
      return (
        <div className="pt-2">
          <Button type="submit" variant="primary">
            {field.label}
          </Button>
        </div>
      );
    }

    return null;
  })();
  
  const showHighlight = props.highlightedSet?.has(field.name);
  const highlightClass =
    showHighlight
      ? props.highlightStatus === 'added'
        ? 'bg-green-100'
        : props.highlightStatus === 'modified'
        ? 'bg-blue-100'
        : ''
      : '';
  
  return (
    <FieldRow
      id={`field-${index}`}
      key={`${field.name}-${index}`}
      onClick={() => onFocus(index)}
      onDragHandleReady={(attrs) => (
        <button
          type="button"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          {...attrs}
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}
      className={highlightClass}
      dataAnchorId={field.name}
      dataFieldName={field.name}
      dataIndex={index}
    >
      {/* Delete button (appears on hover) */}
      <button
        type="button"
        aria-label="Delete field"
        title="Delete field"
        onClick={(e) => {
          e.stopPropagation();
          props.onDeleteField(index);
        }}
        className="absolute -right-3 top-3 hidden h-7 w-7 items-center justify-center rounded-md bg-white text-red-600 shadow ring-1 ring-red-200 hover:bg-red-50 group-hover:flex"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {isFocused ? <AdvancedEditor {...props} /> : content}
    </FieldRow>
  );
};

export default QuestionCard;