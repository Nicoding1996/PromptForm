import React from 'react';
import type { FormData, FormField } from './FormRenderer';

const baseInputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';
const baseLabelClass = 'text-sm font-medium text-gray-700';

const PublicFormRenderer: React.FC<{ formData: FormData | null }> = ({ formData }) => {
  if (!formData) return null;

  const fields = formData.fields ?? [];

  const renderField = (field: FormField, idx: number) => {
    const labelNode = <label className={baseLabelClass} htmlFor={field.name}>{field.label}</label>;

    // Simple inputs
    if (
      field.type === 'text' ||
      field.type === 'email' ||
      field.type === 'password' ||
      field.type === 'date' ||
      field.type === 'time' ||
      field.type === 'file'
    ) {
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <input type={field.type} id={field.name} name={field.name} className={baseInputClass} readOnly />
        </div>
      );
    }

    if (field.type === 'range') {
      const min = (field as any).min ?? 0;
      const max = (field as any).max ?? 10;
      const mid = Math.floor((min + max) / 2);
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <div className="flex items-center gap-4">
            <input
              type="range"
              id={field.name}
              name={field.name}
              min={min}
              max={max}
              defaultValue={mid}
              readOnly
              className="h-2 w-full cursor-not-allowed appearance-none rounded-lg bg-gray-200 accent-indigo-600"
            />
            <output className="min-w-[40px] text-center text-sm font-semibold text-gray-700">{mid}</output>
          </div>
        </div>
      );
    }

    // Textarea
    if (field.type === 'textarea') {
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <textarea id={field.name} name={field.name} rows={4} className={baseInputClass} readOnly />
        </div>
      );
    }

    // Radio
    if (field.type === 'radio') {
      const options = field.options ?? [];
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          <span className={baseLabelClass}>{field.label}</span>
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
                    disabled
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

    // Checkbox (multi)
    if (field.type === 'checkbox') {
      const options = field.options ?? [];
      if (options.length > 0) {
        return (
          <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
            <span className={baseLabelClass}>{field.label}</span>
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
                      disabled
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
        <label className="flex items-center gap-2 text-sm text-gray-700" key={`${field.name}-${idx}`}>
          <input
            type="checkbox"
            id={field.name}
            name={field.name}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            disabled
          />
          <span>{field.label}</span>
        </label>
      );
    }

    // Select
    if (field.type === 'select') {
      const options = field.options ?? [];
      return (
        <div className="flex flex-col gap-2" key={`${field.name}-${idx}`}>
          {labelNode}
          <select id={field.name} name={field.name} className={baseInputClass} defaultValue="" disabled>
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

    // Radio grid
    if (field.type === 'radioGrid') {
      const rows = field.rows ?? [];
      const cols = field.columns ?? [];
      return (
        <div className="flex flex-col gap-3" key={`${field.name}-${idx}`}>
          <span className={baseLabelClass}>{field.label}</span>
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
                              disabled
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

    // Submit
    if (field.type === 'submit') {
      return (
        <div className="pt-2" key={`${field.name}-${idx}`}>
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white opacity-60"
          >
            {field.label}
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-6">
        <h2 className="block text-xl font-semibold text-gray-900">{formData.title}</h2>
        {formData.description && (
          <p className="mt-1 text-sm text-gray-600">{formData.description}</p>
        )}
      </div>
      <div className="space-y-4">
        {fields.map((f, idx) => renderField(f, idx))}
      </div>
    </section>
  );
};

export default PublicFormRenderer;