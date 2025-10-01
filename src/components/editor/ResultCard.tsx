import React from 'react';
import type { ResultPage } from '../FormRenderer';

type Props = {
  index: number;
  page: ResultPage;
  onChange: (index: number, patch: Partial<ResultPage>) => void;
  onDelete: (index: number) => void;
};

const ResultCard: React.FC<Props> = ({ index, page, onChange, onDelete }) => {
  const fromVal = page.scoreRange?.from ?? 0;
  const toVal = page.scoreRange?.to ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-md bg-white p-3 ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600" htmlFor={`outcome-title-${index}`}>
            Result Title
          </label>
          <input
            id={`outcome-title-${index}`}
            value={page.title}
            onChange={(e) => onChange(index, { title: e.target.value })}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
            placeholder="e.g., The Analyst"
          />
        </div>

        <button
          type="button"
          onClick={() => onDelete(index)}
          className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"
          title="Delete this outcome"
          aria-label="Delete outcome"
        >
          Delete
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600" htmlFor={`outcome-from-${index}`}>
            Score From
          </label>
          <input
            id={`outcome-from-${index}`}
            type="number"
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
            defaultValue={fromVal}
            onBlur={(e) => {
              const from = Number(e.target.value);
              onChange(index, { scoreRange: { from: Number.isFinite(from) ? from : 0, to: toVal } });
            }}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600" htmlFor={`outcome-to-${index}`}>
            Score To
          </label>
          <input
            id={`outcome-to-${index}`}
            type="number"
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
            defaultValue={toVal}
            onBlur={(e) => {
              const to = Number(e.target.value);
              onChange(index, { scoreRange: { from: fromVal, to: Number.isFinite(to) ? to : 0 } });
            }}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600" htmlFor={`outcome-desc-${index}`}>
          Result Description
        </label>
        <textarea
          id={`outcome-desc-${index}`}
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          rows={5}
          placeholder="Describe the characteristics and guidance for this result..."
          value={page.description}
          onChange={(e) => onChange(index, { description: e.target.value })}
        />
      </div>
    </div>
  );
};

export default ResultCard;