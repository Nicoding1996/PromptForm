import React, { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { getFormById } from '../services/forms';
import PublicFormRenderer from '../components/PublicFormRenderer';

const PublicFormPage: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formJson, setFormJson] = useState<any | null>(null);
  const [title, setTitle] = useState<string>('Form');
  const [themePrimary, setThemePrimary] = useState<string | null>(null);
  const [themeBackground, setThemeBackground] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!formId) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const row = await getFormById(formId);
        if (!alive) return;
        if (!row) {
          setNotFound(true);
          setFormJson(null);
        } else {
          setTitle(row.title || 'Form');
          setFormJson(row.form);
          // Initialize theme from stored document (fallback to embedded form theme)
          setThemePrimary((row as any)?.theme_primary_color ?? (row as any)?.form?.theme_primary_color ?? null);
          setThemeBackground((row as any)?.theme_background_color ?? (row as any)?.form?.theme_background_color ?? null);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Failed to load form.');
        setFormJson(null);
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  }, [formId]);

  // Scroll reveal for sticky header
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 0);
    onScroll(); // initialize on mount
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className="min-h-screen bg-neutral-50"
      style={{
        background: `linear-gradient(180deg, ${themeBackground || '#F8FAFF'} 0%, #FFFFFF 60%)`,
      }}
    >
      <main className="mx-auto max-w-3xl px-4 pt-0 pb-10">
        <header
          className={`sticky top-0 z-50 -mx-[calc(50vw-50%)] px-[calc(50vw-50%)] mb-6 flex items-center justify-between transition-colors duration-200 ${
            isScrolled ? 'bg-white/85 backdrop-blur-sm border-b border-neutral-200/80' : 'bg-transparent'
          }`}
        >
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              Home
            </Link>
          </div>
        </header>

        {loading ? (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-1/3 rounded bg-gray-200" />
              <div className="h-10 w-full rounded bg-gray-200" />
              <div className="h-24 w-full rounded bg-gray-200" />
            </div>
          </section>
        ) : notFound ? (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-700">Form not found.</p>
          </section>
        ) : error ? (
          <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-red-700">Error: {error}</p>
          </section>
        ) : (
          <PublicFormRenderer
            formData={formJson}
            formId={formId!}
            preview={new URLSearchParams(location.search).get('preview') === 'true'}
            themePrimaryColor={themePrimary || (formJson as any)?.theme_primary_color || undefined}
            themeBackgroundColor={themeBackground || (formJson as any)?.theme_background_color || undefined}
          />
        )}
      </main>
    </div>
  );
};

export default PublicFormPage;