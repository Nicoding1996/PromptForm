import React from 'react';

type SuggestionChipsProps = {
  suggestions?: string[];
  onSelect: (command: string) => void;
  disabled?: boolean;
  className?: string;
};

const DEFAULT_SUGGESTIONS = [
  'Make the form more professional',
  'Add 5 more relevant questions',
  'Simplify the language of all questions',
  'Remove all sections',
];

const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  suggestions = DEFAULT_SUGGESTIONS,
  onSelect,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`w-full ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {suggestions.map((s, i) => (
          <button
            key={`${i}-${s}`}
            type="button"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onSelect(s)}
            disabled={disabled}
            title={s}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestionChips;