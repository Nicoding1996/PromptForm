import React from 'react';
import type { FormField } from '../FormRenderer';

type Props = {
  field: FormField; // must be type 'radioGrid'
  // Full response payload for a single submission (so we can resolve nested, dot, or bracket keys)
  payload: Record<string, any> | null | undefined;
  className?: string;
};

/**
 * GridResponseDisplay
 * Renders a clean two-column list:
 * Row Label: [Answer]
 * for a single radioGrid answer set taken from one response payload.
 *
 * Supports any of the following payload shapes:
 * - nested: payload[field.name][rowLabel] = "Column Label"
 * - flattened dot key: payload["fieldName.Row Label"] = "Column Label"
 * - legacy bracket key: payload["fieldName[0]"] = "2" (column index)
 */
const GridResponseDisplay: React.FC<Props> = ({ field, payload, className }) => {
  const rows = (field.rows ?? []) as string[];
  const cols = (field.columns ?? []) as Array<string | { label: string }>;

  const colLabel = (idx: number): string => {
    const c = cols[idx] as any;
    if (typeof c === 'string') return c;
    return String(c?.label ?? idx);
  };

  const resolve = (rowLabel: string, rIdx: number): string => {
    const name = field.name;
    const p = payload || {};
    // 1) nested object
    const nested = (p?.[name] as any) ?? null;
    if (nested && typeof nested === 'object' && nested[rowLabel] != null) {
      return String(nested[rowLabel] ?? '');
    }
    // 2) flattened dot key
    const dotKey = `${name}.${rowLabel}`;
    if (Object.prototype.hasOwnProperty.call(p, dotKey)) {
      return String(p[dotKey] ?? '');
    }
    // 3) legacy bracket index -> label
    const bracketKey = `${name}[${rIdx}]`;
    const raw = p?.[bracketKey];
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n < cols.length) {
        return colLabel(n);
      }
      return String(raw ?? '');
    }
    return '';
  };

  const items = rows.map((rowLabel, rIdx) => {
    const ans = resolve(rowLabel, rIdx);
    return { rowLabel, ans: ans || '—' };
  });

  if (items.length === 0) {
    return <div className={className || ''}><span className="text-sm text-gray-500">No rows</span></div>;
  }

  return (
    <div className={className || ''}>
      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {items.map((it, i) => (
          <li key={`${field.name}-grid-row-${i}`} className="grid grid-cols-2 gap-2 p-2 text-sm">
            <span className="font-medium text-gray-700">{it.rowLabel}</span>
            <span className="text-gray-900">{it.ans}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GridResponseDisplay;