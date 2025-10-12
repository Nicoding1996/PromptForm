import type { ResultPage } from '../FormRenderer';

export type Range = { from: number; to: number };

export function normalizeInt(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.floor(v) : 0;
}

/**
 * Validate that ranges:
 * - are ordered by index with no overlaps or gaps between neighbors
 * - start at 0
 * - end at maxScore
 */
export function validateOutcomeRanges(pages: ResultPage[] | undefined | null, maxScore: number): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const n = Array.isArray(pages) ? pages.length : 0;
  if (!n) return { valid: true, issues };
 
  const arr: ResultPage[] = Array.isArray(pages) ? pages : [];
  const ranges: Range[] = arr.map((p) => ({
    from: normalizeInt((p as any)?.scoreRange?.from ?? 0),
    to: normalizeInt((p as any)?.scoreRange?.to ?? 0),
  }));

  // Check ordering and neighbor relations
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.from > r.to) issues.push(`Outcome ${i + 1}: from cannot be greater than to.`);
    if (r.from < 0) issues.push(`Outcome ${i + 1}: from must be ≥ 0.`);
    if (r.to > maxScore) issues.push(`Outcome ${i + 1}: to must be ≤ ${maxScore}.`);

    const prev = ranges[i - 1];
    if (prev) {
      if (r.from <= prev.to) issues.push(`Outcome ${i + 1}: overlaps previous (prev to=${prev.to}).`);
      if (r.from > prev.to + 1) issues.push(`Outcome ${i + 1}: gap after previous (prev to=${prev.to}).`);
    }
  }

  // Start and end coverage
  if (ranges[0].from > 0) issues.push(`Coverage gap at start: first "from" is ${ranges[0].from} (should be 0).`);
  const last = ranges[ranges.length - 1];
  if (last.to < maxScore) issues.push(`Coverage gap at end: last "to" is ${last.to} (should be ${maxScore}).`);

  return { valid: issues.length === 0, issues };
}

/**
 * Evenly distribute contiguous, inclusive ranges that exactly cover 0..maxScore.
 * Example: maxScore=9, count=3 -> [0-3], [4-6], [7-9]
 */
export function distributeEvenly(maxScore: number, count: number): Range[] {
  const total = Math.max(0, Math.floor(maxScore)); // inclusive end
  const buckets = Math.max(1, Math.floor(count));
  const length = total + 1; // inclusive coverage
  const base = Math.floor(length / buckets);
  const rem = length % buckets;

  const out: Range[] = [];
  let cursor = 0;
  for (let i = 0; i < buckets; i++) {
    const size = base + (i < rem ? 1 : 0);
    const from = cursor;
    const to = Math.max(from, from + size - 1);
    out.push({ from, to });
    cursor = to + 1;
  }
  // Clamp final to exactly maxScore
  if (out.length) out[out.length - 1].to = total;
  return out;
}

/* cascadeAutoAdjust removed per simplification; manual editing + auto-fix button are now the only paths */