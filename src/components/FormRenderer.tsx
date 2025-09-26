import React, { useState } from 'react';

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
  rows?: string[];    // array of row labels/questions
  columns?: string[]; // array of column choices
}

export interface FormData {
  title: string;
  fields: FormField[];
}

interface FormRendererProps {
  formData: FormData | null;
}

const baseInputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

const baseLabelClass = 'text-sm font-medium text-gray-700';

const FormRenderer: React.FC<FormRendererProps> = ({ formData }) => {
  if (!formData) return null;

  return (
    <section className="mt-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">{formData.title}</h2>

      <form className="space-y-5">
        {formData.fields.map((field, idx) => {
          const key = `${field.name}-${idx}`;

          // Text-like inputs: text, email, password, date, time, file, range
          if (
            field.type === 'text' ||
            field.type === 'email' ||
            field.type === 'password' ||
            field.type === 'date' ||
            field.type === 'time' ||
            field.type === 'file' ||
            field.type === 'range'
          ) {
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const [rangeValue, setRangeValue] = useState(5);
            const inputSpecific =
              field.type === 'range'
                ? 'h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-indigo-600'
                : baseInputClass;

            return (
              <div className="flex flex-col gap-2" key={key}>
                <label className={baseLabelClass} htmlFor={field.name}>
                  {field.label}
                </label>

                {field.type === 'range' ? (
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      id={field.name}
                      name={field.name}
                      min={0}
                      max={10}
                      value={rangeValue}
                      onChange={(e) => setRangeValue(Number(e.target.value))}
                      className={inputSpecific}
                    />
                    <output
                      htmlFor={field.name}
                      className="min-w-[40px] text-center text-sm font-semibold text-gray-700"
                    >
                      {rangeValue}
                    </output>
                  </div>
                ) : (
                  <input
                    type={field.type}
                    id={field.name}
                    name={field.name}
                    className={inputSpecific}
                  />
                )}
              </div>
            );
          }

          // Textarea
          if (field.type === 'textarea') {
            return (
              <div className="flex flex-col gap-2" key={key}>
                <label className={baseLabelClass} htmlFor={field.name}>
                  {field.label}
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  rows={4}
                  className={baseInputClass}
                />
              </div>
            );
          }

          // Radio group
          if (field.type === 'radio') {
            const options = field.options ?? [];
            return (
              <div className="flex flex-col gap-2" key={key}>
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
            // If options provided, render a group; otherwise render a single checkbox
            if (options.length > 0) {
              return (
                <div className="flex flex-col gap-2" key={key}>
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
              <label className="flex items-center gap-2 text-sm text-gray-700" key={key}>
                <input
                  type="checkbox"
                  id={field.name}
                  name={field.name}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{field.label}</span>
              </label>
            );
          }

          // Select dropdown
          if (field.type === 'select') {
            const options = field.options ?? [];
            return (
              <div className="flex flex-col gap-2" key={key}>
                <label className={baseLabelClass} htmlFor={field.name}>
                  {field.label}
                </label>
                <select
                  id={field.name}
                  name={field.name}
                  className={baseInputClass}
                  defaultValue=""
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

          // Radio Grid (matrix-style)
          if (field.type === 'radioGrid') {
            const rows = field.rows ?? [];
            const cols = field.columns ?? [];
            return (
              <div className="flex flex-col gap-3" key={key}>
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
              <div className="pt-2" key={key}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {field.label}
                </button>
              </div>
            );
          }

          // Unknown type: ignore gracefully
          return null;
        })}
      </form>
    </section>
  );
};

export default FormRenderer;