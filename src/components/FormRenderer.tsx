import React, { useState } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { FiTrash2, FiCopy } from 'react-icons/fi';
import { RxDragHandleDots2 } from 'react-icons/rx';

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
    | 'submit';
  name: string;
  options?: string[]; // required for radio | checkbox | select

  // radioGrid-specific structure:
  rows?: string[]; // array of row labels/questions
  columns?: string[]; // array of column choices
}

export interface FormData {
  title: string;
  description?: string;
  fields: FormField[];
}

interface FormRendererProps {
  formData: FormData | null;
  onUpdateFieldLabel: (index: number, newLabel: string) => void;
  onDeleteField: (index: number) => void;
  onReorderFields: (oldIndex: number, newIndex: number) => void;
  onAddField: () => void;

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

  // NEW remove handlers
  onRemoveFieldOption: (fieldIndex: number, optionIndex: number) => void;

  // Grid editing
  onUpdateGridRow: (fieldIndex: number, rowIndex: number, newText: string) => void;
  onUpdateGridColumn: (fieldIndex: number, colIndex: number, newText: string) => void;
  onAddGridRow: (fieldIndex: number) => void;
  onAddGridColumn: (fieldIndex: number) => void;

  // NEW grid remove handlers
  onRemoveGridRow: (fieldIndex: number, rowIndex: number) => void;
  onRemoveGridColumn: (fieldIndex: number, colIndex: number) => void;

  // Range editing
  onUpdateRangeBounds: (fieldIndex: number, min: number, max: number) => void;
}

const baseInputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

const baseLabelClass = 'text-sm font-medium text-gray-700';

/**
 * Range field with visible numeric output.
 * Isolated component so hooks usage is valid (not inside a loop).
 */
const RangeField: React.FC<{
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
const EditableLabel: React.FC<{
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
    <label
      className={`${className} cursor-text`}
      htmlFor={htmlFor}
      title="Click to edit label"
      onClick={() => setEditing(true)}
    >
      {label}
    </label>
  );
};
 
/**
 * Advanced editor view for a focused field.
 */
const AdvancedEditor: React.FC<{
  field: FormField;
  index: number;

  onUpdateFieldLabel: (index: number, newLabel: string) => void;
  onUpdateFieldOption: (fieldIndex: number, optionIndex: number, newText: string) => void;
  onAddFieldOption: (fieldIndex: number) => void;
  onChangeFieldType: (fieldIndex: number, newType: FormField['type']) => void;
  onDuplicateField: (fieldIndex: number) => void;
  onToggleRequiredField: (fieldIndex: number) => void;

  // Remove handlers
  onRemoveFieldOption: (fieldIndex: number, optionIndex: number) => void;

  // Grid + range
  onUpdateGridRow: (fieldIndex: number, rowIndex: number, newText: string) => void;
  onUpdateGridColumn: (fieldIndex: number, colIndex: number, newText: string) => void;
  onAddGridRow: (fieldIndex: number) => void;
  onAddGridColumn: (fieldIndex: number) => void;
  onRemoveGridRow: (fieldIndex: number, rowIndex: number) => void;
  onRemoveGridColumn: (fieldIndex: number, colIndex: number) => void;
  onUpdateRangeBounds: (fieldIndex: number, min: number, max: number) => void;
}> = ({
  field,
  index,
  onUpdateFieldLabel,
  onUpdateFieldOption,
  onAddFieldOption,
  onChangeFieldType,
  onDuplicateField,
  onToggleRequiredField,
  onRemoveFieldOption,
  onUpdateGridRow,
  onUpdateGridColumn,
  onAddGridRow,
  onAddGridColumn,
  onRemoveGridRow,
  onRemoveGridColumn,
  onUpdateRangeBounds,
}) => {
  const optionTypes: FormField['type'][] = [
    'text','email','password','textarea','radio','checkbox','select','date','time','file','range','radioGrid','submit'
  ];
  const needsOptions = field.type === 'radio' || field.type === 'checkbox' || field.type === 'select';
  const options = field.options ?? [];

  const rmin = (field as any).min ?? 0;
  const rmax = (field as any).max ?? 10;

  return (
    <div className="flex flex-col gap-4 rounded-md bg-indigo-50/20 p-3 ring-1 ring-indigo-100" data-adv-editor="true">
      {/* Label editor (WYSIWYG-like) */}
      <EditableLabel
        label={field.label}
        htmlFor={field.name}
        onCommit={(txt) => onUpdateFieldLabel(index, txt)}
      />

      {/* Type switcher + duplicate + required */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-gray-600">Type</label>
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          value={field.type}
          onChange={(e) => onChangeFieldType(index, e.target.value as FormField['type'])}
        >
          {optionTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onDuplicateField(index)}
          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-sm text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          title="Duplicate question"
          aria-label="Duplicate question"
        >
          <FiCopy /> Duplicate
        </button>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={(field as any).required === true}
            onChange={() => onToggleRequiredField(index)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Required
        </label>
      </div>

      {/* Options editor for radio/checkbox/select */}
      {needsOptions && (
        <div className="space-y-2">
          {options.map((opt, optIdx) => (
            <div key={`${field.name}-opt-edit-${optIdx}`} className="flex items-center gap-2">
              <input
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={opt}
                onChange={(e) => onUpdateFieldOption(index, optIdx, e.target.value)}
              />
              <button
                type="button"
                aria-label="Remove option"
                title="Remove option"
                onClick={() => onRemoveFieldOption(index, optIdx)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 ring-1 ring-red-200"
              >
                <FiTrash2 />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onAddFieldOption(index)}
            className="text-sm font-medium text-indigo-700 hover:underline"
          >
            + Add option
          </button>
        </div>
      )}

      {/* RadioGrid editor: editable rows/columns */}
      {field.type === 'radioGrid' && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-gray-600">Columns</div>
            <div className="flex flex-wrap gap-2">
              {(field.columns ?? []).map((col, cIdx) => (
                <div key={`${field.name}-col-edit-${cIdx}`} className="flex items-center gap-2">
                  <input
                    className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value={col}
                    onChange={(e) => onUpdateGridColumn(index, cIdx, e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Remove column"
                    title="Remove column"
                    onClick={() => onRemoveGridColumn(index, cIdx)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 ring-1 ring-red-200"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              ))}
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
                    <FiTrash2 />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onAddGridRow(index)}
              className="mt-2 text-sm font-medium text-indigo-700 hover:underline"
            >
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
const FieldRow: React.FC<{
  id: string;
  children: React.ReactNode;
  onDragHandleReady?: (attrs: React.HTMLAttributes<any>) => React.ReactNode;
  onClick?: () => void;
}> = ({ id, children, onDragHandleReady, onClick }) => {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={style}
      onClick={onClick}
      className={`group relative rounded-lg border border-gray-200 bg-white p-3 transition-shadow ${
        isOver ? 'ring-2 ring-indigo-400' : ''
      }`}
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

const FormRenderer: React.FC<FormRendererProps> = ({
  formData,
  onUpdateFieldLabel,
  onDeleteField,
  onReorderFields,
  onAddField,
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
  onUpdateGridRow,
  onUpdateGridColumn,
  onAddGridRow,
  onAddGridColumn,
  onRemoveGridRow,
  onRemoveGridColumn,
  onUpdateRangeBounds,
}) => {
  // Ensure the submit field (if any) always renders last
  const rawFields = formData?.fields ?? [];
  const submitFields = rawFields.filter((f) => f.type === 'submit');
  const nonSubmitFields = rawFields.filter((f) => f.type !== 'submit');
  const fields = [...nonSubmitFields, ...submitFields];

  const idForIndex = (i: number) => `field-${i}`;
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
    <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
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

      <DndContext onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {fields.map((field, idx) => {
            const key = `${field.name}-${idx}`;
            const id = idForIndex(idx);

            // Shared label node with inline editing
            const labelNode = (
              <EditableLabel
                label={field.label}
                htmlFor={field.name}
                className={baseLabelClass}
                onCommit={(newLabel) => onUpdateFieldLabel(idx, newLabel)}
              />
            );

            // Per-type renderer (unchanged controls)
            const inputSpecific =
              field.type === 'range'
                ? 'h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-indigo-600'
                : baseInputClass;

            let content = (() => {
              // Text-like inputs
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
                        defaultValue={Math.floor((((field as any).min ?? 0) + ((field as any).max ?? 10)) / 2)}
                        className={inputSpecific}
                      />
                    ) : (
                      <input type={field.type} id={field.name} name={field.name} className={inputSpecific} />
                    )}
                  </div>
                );
              }

              // Textarea
              if (field.type === 'textarea') {
                return (
                  <div className="flex flex-col gap-2">
                    {labelNode}
                    <textarea id={field.name} name={field.name} rows={4} className={baseInputClass} />
                  </div>
                );
              }

              // Radio group
              if (field.type === 'radio') {
                const options = field.options ?? [];
                return (
                  <div className="flex flex-col gap-2">
                    <span className={baseLabelClass}>{labelNode}</span>
                    <div className="flex flex-col gap-2">
                      {options.map((opt, optIdx) => {
                        const optId = `${field.name}-radio-${optIdx}`;
                        return (
                          <div className="flex items-center gap-2" key={optId}>
                            <input
                              type="radio"
                              id={optId}
                              name={field.name}
                              value={opt}
                              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
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

              // Checkbox group (multiple-choice)
              if (field.type === 'checkbox') {
                const options = field.options ?? [];
                if (options.length > 0) {
                  return (
                    <div className="flex flex-col gap-2">
                      <span className={baseLabelClass}>{labelNode}</span>
                      <div className="flex flex-col gap-2">
                        {options.map((opt, optIdx) => {
                          const optId = `${field.name}-check-${optIdx}`;
                          return (
                            <label className="flex items-center gap-2 text-sm text-gray-700" key={optId}>
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
                // Single checkbox fallback
                return (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      id={field.name}
                      name={field.name}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{labelNode}</span>
                  </label>
                );
              }

              // Select dropdown
              if (field.type === 'select') {
                const options = field.options ?? [];
                return (
                  <div className="flex flex-col gap-2">
                    {labelNode}
                    <select id={field.name} name={field.name} className={baseInputClass} defaultValue="">
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

              // Radio Grid (matrix-style)
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
                            <th className="p-2 text-left text-xs font-semibold text-gray-600"></th>
                            {cols.map((col, cIdx) => (
                              <th key={`${field.name}-col-${cIdx}`} className="p-2 text-xs font-semibold text-gray-600">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, rIdx) => {
                            const rowName = `${field.name}[${rIdx}]`;
                            return (
                              <tr key={`${field.name}-row-${rIdx}`} className="border-t border-gray-200">
                                <th scope="row" className="p-2 text-left text-sm font-medium text-gray-700">
                                  {row}
                                </th>
                                {cols.map((col, cIdx) => {
                                  const id = `${field.name}-${rIdx}-${cIdx}`;
                                  return (
                                    <td key={id} className="p-2 text-center">
                                      <input
                                        type="radio"
                                        id={id}
                                        name={rowName}
                                        value={String(cIdx)}
                                        className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        aria-label={`${row} - ${col}`}
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

              // Submit button
              if (field.type === 'submit') {
                return (
                  <div className="pt-2">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {field.label}
                    </button>
                  </div>
                );
              }

              return null;
            })();

            // Advanced editor when focused; otherwise simple renderer
            const isFocused = focusedFieldIndex === idx;
            const rendered = isFocused ? (
              <AdvancedEditor
                field={field}
                index={idx}
                onUpdateFieldLabel={onUpdateFieldLabel}
                onUpdateFieldOption={onUpdateFieldOption}
                onAddFieldOption={onAddFieldOption}
                onRemoveFieldOption={onRemoveFieldOption}
                onChangeFieldType={onChangeFieldType}
                onDuplicateField={onDuplicateField}
                onToggleRequiredField={onToggleRequiredField}
                onUpdateGridRow={onUpdateGridRow}
                onUpdateGridColumn={onUpdateGridColumn}
                onAddGridRow={onAddGridRow}
                onAddGridColumn={onAddGridColumn}
                onRemoveGridRow={onRemoveGridRow}
                onRemoveGridColumn={onRemoveGridColumn}
                onUpdateRangeBounds={onUpdateRangeBounds}
              />
            ) : (
              content
            );
 
            return (
              <FieldRow
                id={id}
                key={key}
                onClick={() => setFocusedFieldIndex(idx)}
                onDragHandleReady={(attrs) => (
                  <button
                    type="button"
                    title="Drag to reorder"
                    aria-label="Drag to reorder"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                    {...attrs}
                  >
                    <RxDragHandleDots2 className="h-5 w-5" />
                  </button>
                )}
              >
                {/* Delete button (appears on hover) */}
                <button
                  type="button"
                  aria-label="Delete field"
                  title="Delete field"
                  onClick={() => onDeleteField(idx)}
                  className="absolute -right-3 top-3 hidden h-7 w-7 items-center justify-center rounded-md bg-white text-red-600 shadow ring-1 ring-red-200 hover:bg-red-50 group-hover:flex"
                >
                  <FiTrash2 />
                </button>
 
                {rendered}
              </FieldRow>
            );
          })}
        </div>
      </DndContext>

      {/* Add Question */}
      <div className="mt-6">
        <button
          type="button"
          onClick={onAddField}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-50"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">+</span>
          Add Question
        </button>
      </div>
    </section>
  );
};

export default FormRenderer;