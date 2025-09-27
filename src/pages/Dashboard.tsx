import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listFormsForUser, type StoredForm } from '../services/forms';
import LoginButton from '../components/LoginButton';

const Dashboard: React.FC = () => {
  const { user, initializing } = useAuth();
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);

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
      <div className="min-h-screen bg-gray-100">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">My Forms</h1>
            <LoginButton />
          </header>
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
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
      <div className="min-h-screen bg-gray-100">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">My Forms</h1>
            <LoginButton />
          </header>
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-700">
              You must log in to view your saved forms.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">My Forms</h1>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              Home
            </Link>
            <LoginButton />
          </div>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/2 rounded bg-gray-200" />
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-5 w-1/3 rounded bg-gray-200" />
            </div>
          ) : forms.length === 0 ? (
            <p className="text-sm text-gray-700">No forms saved yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {forms.map((f) => {
                const url = `${baseUrl}/form/${f.id}`;
                return (
                  <li key={f.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-gray-900">{f.title || 'Untitled form'}</div>
                        {f.description && (
                          <div className="text-sm text-gray-600">{f.description}</div>
                        )}
                        <div className="mt-1 text-xs text-gray-500">
                          {f.createdAt?.toDate
                            ? `Created ${f.createdAt.toDate().toLocaleString()}`
                            : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/form/${f.id}`}
                          className="rounded-md bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                          title="Open public link"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setShareOpenId((s) => (s === f.id ? null : f.id))}
                          className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                          title="Share"
                        >
                          Share
                        </button>
                      </div>
                    </div>

                    {shareOpenId === f.id && (
                      <div className="mt-3 rounded-md bg-indigo-50 p-3 ring-1 ring-indigo-100">
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={url}
                            className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(url);
                                // basic feedback
                                alert('Link copied to clipboard');
                              } catch {
                                // fallback
                                prompt('Copy this link:', url);
                              }
                            }}
                            className="rounded-md bg-white px-2 py-1 text-sm font-medium text-gray-700 ring-1 ring-indigo-200 hover:bg-gray-50"
                          >
                            Copy
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-indigo-700">
                          Anyone with this link can view the form.
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