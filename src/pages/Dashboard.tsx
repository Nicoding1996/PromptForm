import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listFormsForUser, type StoredForm, deleteForm, updateFormTitle } from '../services/forms';
import UserMenu from '../components/ui/UserMenu';
import FormCard from '../components/dashboard/FormCard';
import { Trash2, Share2, Copy, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Dashboard: React.FC = () => {
  const { user, initializing } = useAuth();
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameOpenId, setRenameOpenId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [renaming, setRenaming] = useState<boolean>(false);

  // Focus management for modals
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const shareInitialRef = useRef<HTMLButtonElement | null>(null);
  const deleteInitialRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const baseUrl = useMemo(() => {
    // Assumes app runs on same origin for public links
    return window.location.origin;
  }, []);

  // Selected rows for modals
  const shareForm = useMemo(
    () => (shareOpenId ? forms.find((f) => f.id === shareOpenId) ?? null : null),
    [shareOpenId, forms]
  );
  const deleteFormRow = useMemo(
    () => (confirmDeleteId ? forms.find((f) => f.id === confirmDeleteId) ?? null : null),
    [confirmDeleteId, forms]
  );
  const shareUrl = useMemo(
    () => (shareForm ? `${baseUrl}/form/${shareForm.id}` : ''),
    [baseUrl, shareForm]
  );

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
    return () => {
      isMounted = false;
    };
  }, [user]);

  // When Share modal opens, focus Copy button
  useEffect(() => {
    if (shareOpenId) {
      // Defer to ensure element exists in DOM
      setTimeout(() => shareInitialRef.current?.focus(), 0);
    }
  }, [shareOpenId]);

  // When Delete confirm opens, focus the destructive action
  useEffect(() => {
    if (confirmDeleteId) {
      setTimeout(() => deleteInitialRef.current?.focus(), 0);
    }
  }, [confirmDeleteId]);

  // When Rename opens, focus and select the input text
  useEffect(() => {
    if (renameOpenId) {
      setTimeout(() => {
        try {
          renameInputRef.current?.focus();
          renameInputRef.current?.select();
        } catch {}
      }, 0);
    }
  }, [renameOpenId]);

  // Scroll reveal for sticky header
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 0);
    onScroll(); // initialize on mount
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (initializing) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-white">
        <main className="app-container pt-0">
          <header
            className={`sticky top-0 z-50 -mx-[calc(50vw-50%)] px-[calc(50vw-50%)] mb-6 flex items-center justify-between transition-colors duration-200 ${
              isScrolled ? 'bg-white/85 backdrop-blur-sm border-b border-neutral-200/80' : 'bg-transparent'
            }`}
          >
            <h1 className="text-2xl font-bold text-neutral-900">My Forms</h1>
            <UserMenu />
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
      <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-white">
        <main className="app-container pt-0">
          <header
            className={`sticky top-0 z-50 -mx-[calc(50vw-50%)] px-[calc(50vw-50%)] mb-6 flex items-center justify-between transition-colors duration-200 ${
              isScrolled ? 'bg-white/85 backdrop-blur-sm border-b border-neutral-200/80' : 'bg-transparent'
            }`}
          >
            <h1 className="text-2xl font-bold text-neutral-900">My Forms</h1>
            <UserMenu />
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
    <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-white">
      <main className="app-container pt-0">
        <header
          className={`sticky top-0 z-50 -mx-[calc(50vw-50%)] px-[calc(50vw-50%)] mb-6 flex items-center justify-between transition-colors duration-200 ${
            isScrolled ? 'bg-white/85 backdrop-blur-sm border-b border-neutral-200/80' : 'bg-transparent'
          }`}
        >
          <h1 className="text-2xl font-bold text-neutral-900">My Forms</h1>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm font-medium text-neutral-700 hover:text-primary-600">
              Home
            </Link>
            <UserMenu />
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
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {forms.map((f) => (
                  <FormCard
                    key={f.id}
                    form={f}
                    onShare={(id) => {
                      try {
                        lastFocusRef.current = (document.activeElement as HTMLElement) ?? null;
                      } catch {}
                      setShareOpenId(id);
                    }}
                    onDelete={(id) => {
                      try {
                        lastFocusRef.current = (document.activeElement as HTMLElement) ?? null;
                      } catch {}
                      setConfirmDeleteId(id);
                    }}
                    onRename={(id: string, currentTitle: string) => {
                      try {
                        lastFocusRef.current = (document.activeElement as HTMLElement) ?? null;
                      } catch {}
                      setRenameOpenId(id);
                      setRenameValue(currentTitle);
                    }}
                  />
                ))}
              </div>

              {/* Share modal */}
              {shareOpenId && shareForm && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`share-title-${shareForm.id}`}
                >
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => {
                      setShareOpenId(null);
                      setTimeout(() => lastFocusRef.current?.focus(), 0);
                    }}
                  />
                  <div className="relative mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                      <h3
                        id={`share-title-${shareForm.id}`}
                        className="inline-flex items-center gap-2 text-base font-semibold text-gray-900"
                      >
                        <Share2 className="h-4 w-4" /> Share form
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShareOpenId(null);
                          setTimeout(() => lastFocusRef.current?.focus(), 0);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100"
                        aria-label="Close dialog"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="px-5 py-4">
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Public link
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={shareUrl}
                          className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm text-slate-800"
                        />
                        <button
                          ref={shareInitialRef}
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(shareUrl);
                              toast.success('Link copied to clipboard!');
                            } catch {
                              toast.error('Copy failed. Please copy the link manually.');
                            }
                          }}
                          className="btn-ghost"
                          title="Copy link to clipboard"
                          aria-label="Copy link to clipboard"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Copy className="h-4 w-4" /> Copy
                          </span>
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-indigo-700">Anyone with this link can view the form.</div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShareOpenId(null);
                          setTimeout(() => lastFocusRef.current?.focus(), 0);
                        }}
                        className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Rename modal */}
              {renameOpenId && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="rename-title"
                >
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => {
                      setRenameOpenId(null);
                      setTimeout(() => lastFocusRef.current?.focus(), 0);
                    }}
                  />
                  <div className="relative mx-4 w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                      <h3 id="rename-title" className="text-base font-semibold text-gray-900">
                        Rename form
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameOpenId(null);
                          setTimeout(() => lastFocusRef.current?.focus(), 0);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100"
                        aria-label="Close dialog"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="px-5 py-4">
                      <label htmlFor="rename-input" className="mb-1 block text-xs font-medium text-gray-600">
                        Title
                      </label>
                      <input
                        id="rename-input"
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (document.getElementById('rename-save-btn') as HTMLButtonElement)?.click();
                          }
                        }}
                        className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm text-slate-800"
                      />
                    </div>

                    <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRenameOpenId(null);
                          setTimeout(() => lastFocusRef.current?.focus(), 0);
                        }}
                        className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        id="rename-save-btn"
                        type="button"
                        disabled={renaming || !renameValue.trim()}
                        onClick={async () => {
                          const id = renameOpenId;
                          const title = renameValue.trim();
                          if (!id || !title) return;
                          try {
                            setRenaming(true);
                            await updateFormTitle(id, title);
                            setForms((rows) => rows.map((x) => (x.id === id ? { ...x, title } : x)));
                            toast.success('Form renamed');
                          } catch {
                            // optionally toast error
                          } finally {
                            setRenaming(false);
                            setRenameOpenId(null);
                            setTimeout(() => lastFocusRef.current?.focus(), 0);
                          }
                        }}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete confirm modal */}
              {confirmDeleteId && deleteFormRow && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`delete-title-${deleteFormRow.id}`}
                >
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => {
                      setConfirmDeleteId(null);
                      setTimeout(() => lastFocusRef.current?.focus(), 0);
                    }}
                  />
                  <div className="relative mx-4 w-full max-w-sm rounded-lg bg-white shadow-xl ring-1 ring-gray-200">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                      <h3
                        id={`delete-title-${deleteFormRow.id}`}
                        className="inline-flex items-center gap-2 text-base font-semibold text-gray-900"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" /> Delete form
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          setTimeout(() => lastFocusRef.current?.focus(), 0);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100"
                        aria-label="Close dialog"
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
                        onClick={() => {
                          setConfirmDeleteId(null);
                          setTimeout(() => lastFocusRef.current?.focus(), 0);
                        }}
                        className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        ref={deleteInitialRef}
                        type="button"
                        onClick={async () => {
                          const f = deleteFormRow;
                          if (!f) return;
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
                            setTimeout(() => lastFocusRef.current?.focus(), 0);
                          }
                        }}
                        disabled={!!deletingId}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
                        aria-label="Confirm delete form"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;