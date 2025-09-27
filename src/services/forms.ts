import { db } from '../firebase/config';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { FormData } from '../components/FormRenderer';

export type StoredForm = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  form: FormData;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const FORMS_COL = 'forms';

export async function saveFormForUser(userId: string, form: FormData, existingId?: string): Promise<string> {
  if (!userId) throw new Error('Missing userId');
  if (!form) throw new Error('Missing form');

  if (existingId) {
    const ref = doc(db, FORMS_COL, existingId);
    await updateDoc(ref, {
      userId,
      title: form.title,
      description: form.description ?? '',
      form,
      updatedAt: serverTimestamp(),
    });
    return existingId;
  }

  const ref = await addDoc(collection(db, FORMS_COL), {
    userId,
    title: form.title,
    description: form.description ?? '',
    form,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listFormsForUser(userId: string): Promise<StoredForm[]> {
  if (!userId) return [];
  const q = query(
    collection(db, FORMS_COL),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Omit<StoredForm, 'id'>;
    return { id: d.id, ...data };
  });
}

export async function getFormById(id: string): Promise<StoredForm | null> {
  const ref = doc(db, FORMS_COL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Omit<StoredForm, 'id'>;
  return { id: snap.id, ...data };
}