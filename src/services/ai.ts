/**
 * Hybrid AI Service
 * - Centralizes Cloud vs Local (window.ai) generation logic
 * - Provides helpers to query AI capability/status
 *
 * Notes:
 * - Cloud endpoints are served by the Express server in [`server.js`](server.js:1)
 * - Local generation uses Chrome's Prompt API via window.ai (when available)
 */

import type { FormData } from '../components/FormRenderer';

export type GenerateFormParams = {
  prompt?: string;
  file?: File | null;
  /**
   * Base URL of the backend server (cloud AI proxy).
   * Resolved from VITE_API_BASE or explicit override.
   * In development only, falls back to http://localhost:3001.
   */
  serverBase?: string;
};

export type AIStatus =
  | { online: true; local: boolean; mode: 'cloud' }
  | { online: false; local: true; mode: 'local' }
  | { online: false; local: false; mode: 'offline-unsupported' };

const DEFAULT_DEV_SERVER_BASE = 'http://localhost:3001';
// Resolve server base URL from param override or Vite env; dev-only fallback to localhost
const ENV_SERVER_BASE = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
export function resolveServerBase(override?: string): string {
  const isDev = !!(import.meta as any)?.env?.DEV;
  const base = override || ENV_SERVER_BASE || (isDev ? DEFAULT_DEV_SERVER_BASE : undefined);
  if (!base) {
    throw new Error('API base URL is not configured. Set VITE_API_BASE.');
  }
  // normalize: remove trailing slash to avoid double slashes in fetch URLs
  return String(base).replace(/\/+$/, '');
}

/**
 * Returns true when the current browser exposes window.ai.prompt()
 */
export function isLocalAICapable(): boolean {
  try {
    return typeof window !== 'undefined'
      && (window as any)?.ai
      && typeof (window as any).ai.prompt === 'function';
  } catch {
    return false;
  }
}

/**
 * Returns the current AI status: online/cloud vs offline/local support.
 */
export function getAIStatus(): AIStatus {
  const online = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
  const local = isLocalAICapable();

  if (online) return { online: true, local, mode: 'cloud' };
  if (local) return { online: false, local: true, mode: 'local' };
  return { online: false, local: false, mode: 'offline-unsupported' };
}

/**
 * Local AI (window.ai) generation.
 * Accepts a user prompt and returns a parsed form JSON object.
 * Throws on failure.
 */
export async function generateFormLocal(userPrompt: string): Promise<FormData> {
  if (!isLocalAICapable()) {
    throw new Error('Local AI is not available in this browser.');
  }

  const systemPrompt = [
    'You are an expert form generator.',
    'Return ONLY a valid JSON object representing a web form.',
    'The JSON must have "title", "description", and a "fields" array.',
    'Each field object must include "label", "type", and "name".',
    'Allowed "type" values: text, email, password, textarea, radio, checkbox, select, date, time, file, range, radioGrid, section, submit.',
    'Use snake_case for unique "name" values.',
    'Include exactly one "submit" field as the final item in "fields".',
    'Return ONLY the JSON. No prose. No markdown.'
  ].join(' ');

  const composed = `${systemPrompt}\n\nUser request: "${String(userPrompt || '').trim()}"`;

  const raw = String(await (window as any).ai.prompt(composed)).trim();
  if (!raw) {
    throw new Error('Local AI returned an empty response.');
  }

  const data = parseJsonLike(raw);
  return data as FormData;
}

/**
 * Cloud AI generation via backend.
 * Supports three modes:
 *  - Text prompt -> POST /generate-form
 *  - Image file  -> POST /generate-form-from-image
 *  - TXT/PDF/DOCX -> POST /generate-form-from-document (multipart)
 */
export async function generateFormCloud(params: GenerateFormParams): Promise<FormData> {
  const { prompt = '', file = null, serverBase } = params;
  const base = resolveServerBase(serverBase);

  let resp: Response | null = null;

  if (file) {
    if (file.type && file.type.startsWith('image/')) {
      const { base64, mimeType } = await fileToBase64(file);
      resp = await fetch(`${base}/generate-form-from-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mimeType,
          context: prompt || undefined,
        }),
      });
    } else {
      const form = new FormData();
      form.append('file', file, file.name);
      if (prompt) form.append('prompt', prompt);
      resp = await fetch(`${base}/generate-form-from-document`, {
        method: 'POST',
        body: form,
      });
    }
  } else {
    resp = await fetch(`${base}/generate-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  }

  // Attempt JSON parse even on non-OK responses (to surface server error payloads)
  let data: unknown = null;
  try {
    data = await resp.json();
  } catch {
    // ignore, keep data as null
  }

  if (!resp.ok) {
    const message = pickFirstString((data as any)?.error, (data as any)?.message) || 'Failed to generate form.';
    throw new Error(message);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Cloud AI returned invalid data.');
  }

  return data as FormData;
}

/**
 * Hybrid dispatcher:
 * - If offline and local AI is available AND no file is provided -> local path
 * - Otherwise -> cloud path
 * Throws with a human-readable message when an operation is not possible offline.
 */
export async function generateFormHybrid(params: GenerateFormParams): Promise<FormData> {
  const status = getAIStatus();

  // Offline mode
  if (!status.online) {
    if (!params.prompt || !String(params.prompt).trim()) {
      throw new Error('Offline generation requires a text prompt.');
    }
    if (params.file) {
      throw new Error('Offline generation supports text prompts only (file/image not supported offline).');
    }
    if (!status.local) {
      throw new Error('You are offline and Local AI (window.ai) is unavailable in this browser.');
    }
    return await generateFormLocal(params.prompt!);
  }

  // Online (cloud) path
  return await generateFormCloud(params);
}

/* ---------------------------- helpers ---------------------------- */

function pickFirstString(...vals: any[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length) return v;
  }
  return null;
}

/**
 * Robust JSON extractor: tries strict JSON.parse first; if it fails,
 * extracts the first {...} block from the text.
 */
export function parseJsonLike(text: string): any {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('Empty text.');
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = raw.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error('Response was not valid JSON.');
  }
}

/**
 * Convert a File to Base64 (without data: prefix) and detect mime type.
 */
export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = String(reader.result);
        const [prefix, b64] = result.split(',');
        const mimeType = prefix?.match(/data:(.*);base64/)?.[1] ?? file.type;
        if (!b64) return reject(new Error('Failed to read file as Base64.'));
        resolve({ base64: b64, mimeType });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}