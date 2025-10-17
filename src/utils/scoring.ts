import type { FormData, FormField, ScoringRule, ResultPage } from '../components/FormRenderer';

export type KnowledgeResult = {
  type: 'KNOWLEDGE';
  score: number;
  maxScore: number;
};

export type OutcomeResult = {
  type: 'OUTCOME';
  outcomeId: string | null;
  outcomeTitle: string | null;
  totals: Record<string, number>;
  score: number;
  maxScore: number;
};

export type CalcResult = KnowledgeResult | OutcomeResult;

const normalizeLoose = (v: any) => {
  // Lowercase, strip cosmetic parenthetical numbers like "(1)", "( 2 )", then collapse whitespace.
  // This makes "Sometimes Applies (2)" match "Sometimes Applies" in trait scoring.
  const s = String(v ?? '').toLowerCase();
  const noParensNums = s.replace(/\(\s*\d+\s*\)/g, '');
  return noParensNums.trim().replace(/\s+/g, ' ');
};
const toArray = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : []);
const setFrom = (arr: string[]) => new Set(arr.map(normalizeLoose));
const setsEqual = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const snake = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Resolve a column label from radioGrid columns.
 */
function colLabel(col: any, idx: number): string {
  if (typeof col === 'string') return col;
  if (col && typeof col === 'object' && typeof col.label === 'string') return col.label;
  return String(idx);
}

/**
 * Get selected label for a radioGrid row from a submission payload.
 * Supports:
 *  - nested object: payload[fieldName][rowLabel] = "Column Label"
 *  - flattened dot key: payload["fieldName.Row Label"] = "Column Label"
 *  - legacy bracket index: payload["fieldName[0]"] = "2" (index)
 */
function getGridSelectedLabel(
  submission: Record<string, any>,
  field: FormField,
  rowLabel: string,
  rowIndex: number
): string | null {
  const p = submission || {};
  const nested = (p as any)?.[field.name] ?? null;
  if (nested && typeof nested === 'object' && nested[rowLabel] != null) {
    const v = String(nested[rowLabel]);
    return v.length ? v : null;
  }
  const dotKey = `${field.name}.${rowLabel}`;
  if (Object.prototype.hasOwnProperty.call(p, dotKey)) {
    const v = String(p[dotKey]);
    return v.length ? v : null;
  }
  const bracketKey = `${field.name}[${rowIndex}]`;
  const raw = (p as any)?.[bracketKey];
  if (raw != null) {
    const n = Number(raw);
    const cols: any[] = (field as any).columns ?? [];
    if (Number.isFinite(n) && n >= 0 && n < cols.length) {
      const label = colLabel(cols[n], n);
      return label;
    }
    const v = String(raw);
    return v.length ? v : null;
  }
  return null;
}

/**
 * Knowledge scoring: mirrors the deterministic logic used at submission time.
 * - radio/select/checkbox/text/textarea with correctAnswer (+ optional regex pattern)
 * - radioGrid: per-row points from column config; falls back to ordinal if points missing/equal everywhere
 */
function calculateKnowledge(form: FormData, submission: Record<string, any>): KnowledgeResult {
  let score = 0;
  let max = 0;

  const fields = form.fields ?? [];
  const nrm = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  for (const f of fields) {
    const pointsRaw = Number((f as any).points ?? 1);
    const points = Number.isFinite(pointsRaw) ? pointsRaw : 1;
    const userVal = submission[f.name];

    // Optional regex support
    const patternStr = (f as any).answerPattern as string | undefined;
    let regex: RegExp | null = null;
    if (typeof patternStr === 'string' && patternStr.length > 0) {
      try {
        regex = new RegExp(patternStr, 'i');
      } catch {
        regex = null;
      }
    }

    let ok: boolean | null = null; // null -> not gradable, don't increase max

    if (f.type === 'radioGrid') {
      const rows = (f as any).rows ?? [];
      const cols = (f as any).columns ?? [];

      const rawPoints: number[] = cols.map((c: any) => {
        if (typeof c === 'string') return NaN;
        const p = Number(c?.points);
        return Number.isFinite(p) ? p : NaN;
      });

      const allMissing = rawPoints.every((p) => !Number.isFinite(p));
      const allEqualFinite = rawPoints.every((p) => Number.isFinite(p)) && rawPoints.every((p) => p === rawPoints[0]);

      const fallbackOrdinal = allMissing || allEqualFinite;
      const effectivePoints = (idx: number): number => {
        if (fallbackOrdinal) return idx + 1;
        const p = rawPoints[idx];
        return Number.isFinite(p) ? p : 1;
      };

      const maxColPts = cols.length > 0 ? Math.max(...cols.map((_: any, i: number) => effectivePoints(i))) : 0;

      rows.forEach((rowLabel: string, rIdx: number) => {
        max += maxColPts;
        const selectedLabel =
          (submission?.[f.name]?.[rowLabel] as any) ??
          (submission as any)?.[`${f.name}.${rowLabel}`] ??
          getGridSelectedLabel(submission, f, rowLabel, rIdx);
        if (selectedLabel != null) {
          const idx = cols.findIndex((c: any) => nrm(colLabel(c, 0)) === nrm(selectedLabel));
          if (idx >= 0) score += effectivePoints(idx);
        }
      });
      continue;
    }

    // Range fields contribute their selected value normalized to 0..(max-min)
    if (f.type === 'range') {
      const minRaw = Number((f as any).min ?? 0);
      const maxRaw = Number((f as any).max ?? 10);
      const minV = Number.isFinite(minRaw) ? Math.floor(minRaw) : 0;
      const maxV = Number.isFinite(maxRaw) ? Math.floor(maxRaw) : 10;
      const lo = Math.min(minV, maxV);
      const hi = Math.max(minV, maxV);
      const span = Math.max(0, hi - lo);
      const vNum = Number(userVal);
      const selected = Number.isFinite(vNum) ? Math.floor(vNum) : lo;
      const clamped = Math.max(lo, Math.min(hi, selected));
      max += span;
      score += clamped - lo;
      continue;
    } else if (f.type === 'radio' || f.type === 'select') {
      const correct = (f as any).correctAnswer as string | undefined;
      if (regex) ok = regex.test(String(userVal ?? ''));
      else if (typeof correct === 'string' && correct.length > 0) ok = nrm(userVal) === nrm(correct);
    } else if (f.type === 'checkbox') {
      const correctRaw = (f as any).correctAnswer;
      if (Array.isArray(correctRaw)) {
        const userSet = setFrom(toArray(userVal));
        const correctSet = setFrom(correctRaw);
        ok = setsEqual(userSet, correctSet);
      } else if (typeof correctRaw === 'string' && correctRaw.length > 0) {
        const userSet = setFrom(toArray(userVal));
        ok = userSet.has(nrm(correctRaw));
      }
    } else if (f.type === 'text' || f.type === 'textarea') {
      const correct = (f as any).correctAnswer as string | undefined;
      if (regex) ok = regex.test(String(userVal ?? ''));
      else if (typeof correct === 'string' && correct.length > 0) ok = nrm(userVal) === nrm(correct);
    }

    if (ok !== null) {
      max += points;
      if (ok) score += points;
    }
  }

  return { type: 'KNOWLEDGE', score, maxScore: max };
}

/**
 * Trait-based (Outcome) scoring:
 * - For radio/select: scoring rules with { option, points, outcomeId }
 * - For checkbox: add points for each selected option that has a rule
 * - For radioGrid: per-row selected column label -> rule { column, points, outcomeId }
 */
function calculateOutcome(form: FormData, submission: Record<string, any>): OutcomeResult {
  // Compute maxScore: maximum possible winning total
  const outcomeMaxes: Record<string, number> = {};
  for (const f of form.fields ?? []) {
    const scoringArr = Array.isArray((f as any).scoring) ? ((f as any).scoring as any[]) : [];
    if (scoringArr.length === 0) continue;

    const fieldMaxes: Record<string, number> = {};
    for (const r of scoringArr) {
      if (!r || !r.outcomeId) continue;
      const pts = Number.isFinite(Number(r.points)) ? Number(r.points) : 1;
      fieldMaxes[r.outcomeId] = Math.max(fieldMaxes[r.outcomeId] || 0, pts);
    }

    for (const [outcomeId, pts] of Object.entries(fieldMaxes)) {
      outcomeMaxes[outcomeId] = (outcomeMaxes[outcomeId] || 0) + pts;
    }
  }
  const maxScore = Math.max(0, ...Object.values(outcomeMaxes));
  const pages: ResultPage[] = Array.isArray(form.resultPages) ? (form.resultPages as ResultPage[]) : [];
  const orderedOutcomeIds: string[] = pages.map((p) => (p as any).outcomeId || snake(p.title));
  const titleById: Record<string, string> = {};
  pages.forEach((p) => {
    const id = (p as any).outcomeId || snake(p.title);
    titleById[id] = p.title;
  });

  const totals: Record<string, number> = {};
  const ensure = (id: string) => {
    if (!totals[id]) totals[id] = 0;
  };
  console.log("Starting Trait-Based Scoring. Initial scores:", { ...totals });

  const norm = (s: any) => normalizeLoose(s);

  for (const f of form.fields ?? []) {
    const scoringArr = Array.isArray((f as any).scoring) ? ((f as any).scoring as ScoringRule[]) : [];
    if (scoringArr.length === 0) continue;

    // Index rules for faster lookups
    const byOption: Record<string, ScoringRule> = {};
    const byColumn: Record<string, ScoringRule> = {};
    for (const r of scoringArr) {
      if (!r) continue;
      if (r.option) byOption[norm(r.option)] = r;
      if (r.column) byColumn[norm(r.column)] = r;
      if (r.outcomeId) ensure(r.outcomeId);
    }

    if (f.type === 'radio' || f.type === 'select') {
      const v = submission[f.name];
      const key = norm(v);
      const rule = byOption[key];
      console.log(`--- Question: ${String((f as any)?.label ?? f.name)} ---`);
      console.log(`User Answer:`, v);
      console.log("Matching Rule Found:", rule);
      if (rule && rule.outcomeId) {
        ensure(rule.outcomeId);
        totals[rule.outcomeId] += Number.isFinite(Number(rule.points)) ? Number(rule.points) : 0;
        console.log("Updated Scores:", { ...totals });
      }
    } else if (f.type === 'checkbox') {
      const list = toArray(submission[f.name]);
      for (const v of list) {
        const key = norm(v);
        const rule = byOption[key];
        if (rule && rule.outcomeId) {
          ensure(rule.outcomeId);
          totals[rule.outcomeId] += Number.isFinite(Number(rule.points)) ? Number(rule.points) : 0;
        }
      }
    } else if (f.type === 'radioGrid') {
      const rows = (f as any).rows ?? [];
      console.log(`--- Question: ${String((f as any)?.label ?? f.name)} (radioGrid) ---`);
      rows.forEach((rowLabel: string, rIdx: number) => {
        const sel = getGridSelectedLabel(submission, f, rowLabel, rIdx);
        if (sel != null) {
          const rule = byColumn[norm(sel)];
          console.log(`Row: ${rowLabel} | User Answer: ${sel}`);
          console.log("Matching Rule Found:", rule);
          if (rule && rule.outcomeId) {
            ensure(rule.outcomeId);
            totals[rule.outcomeId] += Number.isFinite(Number(rule.points)) ? Number(rule.points) : 0;
            console.log("Updated Scores:", { ...totals });
          }
        } else {
          // Also try nested/dot forms if present directly
          const nested = (submission?.[f.name] as any) ?? null;
          let chosen: string | null = null;
          if (nested && typeof nested === 'object' && nested[rowLabel] != null) {
            chosen = String(nested[rowLabel] ?? '');
          } else {
            const dotKey = `${f.name}.${rowLabel}`;
            if (Object.prototype.hasOwnProperty.call(submission || {}, dotKey)) {
              chosen = String((submission as any)[dotKey] ?? '');
            }
          }
          if (chosen != null && chosen.length > 0) {
            const rule = byColumn[norm(chosen)];
            console.log(`Row: ${rowLabel} | User Answer (fallback): ${chosen}`);
            console.log("Matching Rule Found:", rule);
            if (rule && rule.outcomeId) {
              ensure(rule.outcomeId);
              totals[rule.outcomeId] += Number.isFinite(Number(rule.points)) ? Number(rule.points) : 0;
              console.log("Updated Scores:", { ...totals });
            }
          }
        }
      });
    }
  }

  console.log("FINAL TRAIT SCORES:", totals);
  // Choose winner: max points; tie-breaker = first by resultPages order; if empty totals, fall back to first page.
  let bestId: string | null = null;
  let bestPoints = -Infinity;

  const ids = new Set<string>([
    ...Object.keys(totals),
    ...orderedOutcomeIds, // ensure known ids considered even if zero
  ]);

  for (const id of ids) {
    const pts = totals[id] ?? 0;
    if (pts > bestPoints) {
      bestPoints = pts;
      bestId = id;
    } else if (pts === bestPoints) {
      // tie-break by order
      const a = orderedOutcomeIds.indexOf(id);
      const b = orderedOutcomeIds.indexOf(bestId || '');
      if (a >= 0 && (b < 0 || a < b)) {
        bestId = id;
      }
    }
  }

  if (!bestId) {
    bestId = orderedOutcomeIds[0] || null;
  }
  const bestTitle = bestId ? (titleById[bestId] ?? null) : null;

  console.log("Winning outcome:", { outcomeId: bestId, outcomeTitle: bestTitle, score: bestPoints, maxScore });

  return { type: 'OUTCOME', outcomeId: bestId, outcomeTitle: bestTitle, totals, score: bestPoints, maxScore };
}

/**
 * Central scoring engine.
 * - If form.quizType === 'KNOWLEDGE' => returns KnowledgeResult
 * - If form.quizType === 'OUTCOME' => returns OutcomeResult
 */
export function calculateResult(form: FormData, submission: Record<string, any>): CalcResult {
  const qt = (form as any)?.quizType as ('KNOWLEDGE' | 'OUTCOME' | undefined);
  if (qt === 'OUTCOME') {
    return calculateOutcome(form, submission);
  }
  if (qt === 'KNOWLEDGE') {
    return calculateKnowledge(form, submission);
  }

  // Heuristic auto-detection for legacy/unspecified forms:
  // Treat as OUTCOME only if:
  //  - Any field has trait-based scoring rules, OR
  //  - There are result pages that include a stable outcomeId (explicit outcome-based config)
  const hasTraitScoring =
    Array.isArray(form.fields) &&
    (form.fields as any[]).some((f) => Array.isArray((f as any).scoring) && (f as any).scoring.length > 0);

  const hasOutcomeIds =
    Array.isArray(form.resultPages) &&
    (form.resultPages as ResultPage[]).some((p) => typeof (p as any)?.outcomeId === 'string' && (p as any).outcomeId.length > 0);

  if (hasTraitScoring || hasOutcomeIds) {
    return calculateOutcome(form, submission);
  }

  // Legacy quiz flag -> knowledge
  if ((form as any)?.isQuiz === true) {
    return calculateKnowledge(form, submission);
  }

  // No scoring configured
  return { type: 'KNOWLEDGE', score: 0, maxScore: 0 };
}