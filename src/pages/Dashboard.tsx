import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listFormsForUser, type StoredForm, deleteForm } from '../services/forms';
import LoginButton from '../components/LoginButton';
import { Trash2, Share2, Pencil, Copy, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Dashboard: React.FC = () => {
  const { user, initializing } = useAuth();
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const baseUrl = useMemo(() => {
    // Assumes app runs on same origin for public links
    return window.location.origin;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (!user) {
        setForms([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await listFormsForUser(user.uid);
        if (isMounted) setForms(rows);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    run();
    return () => { isMounted = false; };
  }, [user]);

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-100">
        <main className="app-container">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">My Forms</h1>
            <LoginButton />
          </header>
          <div className="card p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-1/3 rounded bg-gray-200" />
              <div className="h-5 w-1/2 rounded bg-gray-200" />
              <div className="h-5 w-2/3 rounded bg-gray-200" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100">
        <main className="app-container">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">My Forms</h1>
            <LoginButton />
          </header>
          <div className="card p-6">
            <p className="text-sm text-slate-700">
              You must log in to view your saved forms.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="app-container">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">My Forms</h1>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="btn-ghost"
            >
              Home
            </Link>
            <LoginButton />
          </div>
        </header>

        <section className="card p-6">
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/2 rounded bg-gray-200" />
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-5 w-1/3 rounded bg-gray-200" />
            </div>
          ) : forms.length === 0 ? (
            <p className="text-sm text-slate-700">No forms saved yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {forms.map((f) => {
                const url = `${baseUrl}/form/${f.id}`;
                return (
                  <li key={f.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-900">{f.title || 'Untitled form'}</div>
                        {f.description && (
                          <div className="text-sm text-slate-600">{f.description}</div>
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          {f.createdAt?.toDate
                            ? `Created ${f.createdAt.toDate().toLocaleString()}`
                            : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/form/${f.id}/edit`}
                          className="btn-ghost"
                          title="Edit form"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Pencil className="h-4 w-4" /> Edit
                          </span>
                        </Link>

                        <button
                          type="button"
                          onClick={() => setShareOpenId((s) => (s === f.id ? null : f.id))}
                          className="btn-brand"
                          title="Share"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Share2 className="h-4 w-4" /> Share
                          </span>
                        </button>

                        <button
                          type="button"
                          title="Delete form"
                          onClick={() => setConfirmDeleteId(f.id)}
                          disabled={deletingId === f.id}
                          className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>

                    {shareOpenId === f.id && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/40" onClick={() => setShareOpenId(null)} />
                        <div className="relative mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
                          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                            <h3 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2">
                              <Share2 className="h-4 w-4" /> Share form
                            </h3>
                            <button
                              type="button"
                              onClick={() => setShareOpenId(null)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100"
                              aria-label="Close"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="px-5 py-4">
                            <label className="mb-1 block text-xs font-medium text-gray-600">Public link</label>
                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={url}
                                className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm text-slate-800"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(url);
                                    toast.success('Link copied to clipboard!');
                                  } catch {
                                    toast.error('Copy failed. Please copy the link manually.');
                                  }
                                }}
                                className="btn-ghost"
                                title="Copy link to clipboard"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <Copy className="h-4 w-4" /> Copy
                                </span>
                              </button>
                            </div>
                            <div className="mt-2 text-xs text-indigo-700">
                              Anyone with this link can view the form.
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                            <button
                              type="button"
                              onClick={() => setShareOpenId(null)}
                              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {confirmDeleteId === f.id && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDeleteId(null)} />
                        <div className="relative mx-4 w-full max-w-sm rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
                          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                            <h3 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2">
                              <Trash2 className="h-4 w-4 text-red-600" /> Delete form
                            </h3>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100"
                              aria-label="Close"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="px-5 py-4">
                            <p className="text-sm text-gray-700">
                              Are you sure you want to delete this form? This action cannot be undone.
                            </p>
                          </div>
                          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setDeletingId(f.id);
                                  await deleteForm(f.id);
                                  setForms((rows) => rows.filter((x) => x.id !== f.id));
                                  if (shareOpenId === f.id) setShareOpenId(null);
                                  toast.success('Form deleted successfully!');
                                } catch {
                                  toast.error('Failed to delete form.');
                                } finally {
                                  setDeletingId(null);
                                  setConfirmDeleteId(null);
                                }
                              }}
                              disabled={deletingId === f.id}
                              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;