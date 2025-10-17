import { db } from '../firebase/config';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  deleteDoc,
} from 'firebase/firestore';
import type { FormData } from '../components/FormRenderer';

export type StoredForm = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  form: FormData;

  // Theme (Adaptive Theming System)
  theme_name?: string; // e.g., "Indigo" | "Slate" | "Rose" | "Amber" | "Emerald" | "Sky"
  theme_primary_color?: string; // e.g., "#6366F1"
  theme_background_color?: string; // e.g., "#E0E7FF"

  // Persisted AI summary (Markdown) and last updated timestamp
  aiSummary?: string;
  aiSummaryUpdatedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;

  // New fields for dashboard enhancements
  lastOpenedAt?: Timestamp;
  responseCount?: number;
};

const FORMS_COL = 'forms';

export async function saveFormForUser(userId: string, form: FormData, existingId?: string): Promise<string> {
  if (!userId) throw new Error('Missing userId');
  if (!form) throw new Error('Missing form');

  // Extract theme fields from the AI-generated form JSON if present
  const themeObj: any = (form as any).theme || {};
  const theme_name: string | null =
    (form as any).theme_name ?? (form as any).themeName ?? themeObj.name ?? null;
  const theme_primary_color: string | null =
    (form as any).theme_primary_color ??
    (form as any).themePrimaryColor ??
    themeObj.primaryColor ??
    null;
  const theme_background_color: string | null =
    (form as any).theme_background_color ??
    (form as any).themeBackgroundColor ??
    themeObj.backgroundColor ??
    null;

  if (existingId) {
    const ref = doc(db, FORMS_COL, existingId);
    await updateDoc(ref, {
      userId,
      title: form.title,
      description: form.description ?? '',
      form,
      // Adaptive Theming fields
      theme_name,
      theme_primary_color,
      theme_background_color,
      updatedAt: serverTimestamp(),
    });
    return existingId;
  }

  const ref = await addDoc(collection(db, FORMS_COL), {
    userId,
    title: form.title,
    description: form.description ?? '',
    form,
    // Adaptive Theming fields
    theme_name,
    theme_primary_color,
    theme_background_color,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listFormsForUser(userId: string): Promise<StoredForm[]> {
  if (!userId) return [];
  // Remove orderBy to avoid requiring a composite index; we sort client-side below.
  const q = query(
    collection(db, FORMS_COL),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);

  // Base docs
  const base = snap.docs.map((d) => {
    const data = d.data() as Omit<StoredForm, 'id'>;
    return { id: d.id, ...data };
  });

  // Efficiently attach response counts without downloading all responses
  const withCounts = await Promise.all(
    base.map(async (f) => {
      try {
        const agg = await getCountFromServer(collection(db, FORMS_COL, f.id, 'responses'));
        return { ...f, responseCount: agg.data().count ?? 0 };
      } catch {
        return { ...f, responseCount: 0 };
      }
    })
  );

  // Smart sort: lastOpenedAt (if present) else updatedAt else createdAt
  withCounts.sort((a, b) => {
    const ta =
      (a.lastOpenedAt?.toMillis?.() ??
        a.updatedAt?.toMillis?.() ??
        a.createdAt?.toMillis?.() ??
        0);
    const tb =
      (b.lastOpenedAt?.toMillis?.() ??
        b.updatedAt?.toMillis?.() ??
        b.createdAt?.toMillis?.() ??
        0);
    return tb - ta;
  });

  return withCounts;
}

export async function getFormById(id: string): Promise<StoredForm | null> {
  const ref = doc(db, FORMS_COL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Omit<StoredForm, 'id'>;
  return { id: snap.id, ...data };
}

export type StoredResponse = {
  id: string;
  payload: Record<string, any>;
  createdAt?: Timestamp;
};

export async function listResponsesForForm(formId: string): Promise<StoredResponse[]> {
  const q = query(collection(db, FORMS_COL, formId, 'responses'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Omit<StoredResponse, 'id'>;
    return { id: d.id, ...data };
  });
}

/**
 * Update only the form title (used for quick rename from dashboard).
 */
export async function updateFormTitle(id: string, title: string): Promise<void> {
  const ref = doc(db, FORMS_COL, id);
  await updateDoc(ref, { title, updatedAt: serverTimestamp() });
}

/**
 * Persist the AI summary (Markdown) for a form document.
 * This runs on the authenticated client so Firestore rules permit the write.
 */
export async function updateFormAiSummary(id: string, aiSummary: string): Promise<void> {
  const ref = doc(db, FORMS_COL, id);
  await updateDoc(ref, {
    aiSummary,
    aiSummaryUpdatedAt: serverTimestamp(),
  });
}

/**
 * Mark a form as opened to support "recently accessed" sorting.
 */
export async function markFormOpened(id: string): Promise<void> {
  const ref = doc(db, FORMS_COL, id);
  await updateDoc(ref, { lastOpenedAt: serverTimestamp() });
}

export async function updateFormTheme(
  id: string,
  theme: {
    theme_name: string;
    theme_primary_color: string;
    theme_background_color: string;
  }
): Promise<void> {
  const ref = doc(db, FORMS_COL, id);
  await updateDoc(ref, {
    theme_name: theme.theme_name,
    theme_primary_color: theme.theme_primary_color,
    theme_background_color: theme.theme_background_color,
    updatedAt: serverTimestamp(),
  });
}
export async function deleteForm(id: string): Promise<void> {
  // Perform delete on the client with the current authenticated user so Firestore rules apply:
  // allow delete: if request.auth != null && get(...forms/$(formId)).data.userId == request.auth.uid;
  await deleteDoc(doc(db, FORMS_COL, id));
}

/**
 * Duplicate a form for the given user.
 * - Copies form structure, title, description, and theme fields
 * - Does NOT copy any responses (responses live in a subcollection and are not touched)
 * - Renames title to "… (Copy)"
 */
export async function duplicateForm(userId: string, sourceId: string): Promise<StoredForm> {
  if (!userId) throw new Error('Missing userId');
  if (!sourceId) throw new Error('Missing sourceId');

  const src = await getFormById(sourceId);
  if (!src) throw new Error('Source form not found');

  const newTitle = `${src.title || 'Untitled form'} (Copy)`;

  const newFormData: FormData = {
    ...(src.form as any),
    title: newTitle,
    description: (src.form as any)?.description ?? src.description ?? '',
  } as FormData;

  const ref = await addDoc(collection(db, FORMS_COL), {
    userId,
    title: newTitle,
    description: src.description ?? '',
    form: newFormData,
    // Preserve adaptive theming fields exactly as stored
    theme_name: src.theme_name ?? null,
    theme_primary_color: src.theme_primary_color ?? null,
    theme_background_color: src.theme_background_color ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Read back to obtain resolved server timestamps
  const snap = await getDoc(ref);
  const data = snap.data() as Omit<StoredForm, 'id'>;
  // Ensure responseCount is initialized to 0 for UI purposes
  return { id: snap.id, ...data, responseCount: 0 };
}