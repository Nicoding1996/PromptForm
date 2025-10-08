import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { markFormOpened, type StoredForm } from '../../services/forms';
import { FileText, MoreVertical, Share2, Trash2, ExternalLink, TextCursorInput, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { createPortal } from 'react-dom';

type Props = {
  form: StoredForm;
  onShare: (formId: string) => void;
  onDelete: (formId: string) => void;
  onRename: (formId: string, currentTitle: string) => void;
};

function formatOpened(ts?: any): string {
  try {
    const d: Date | null =
      ts && typeof ts.toDate === 'function' ? (ts.toDate() as Date) : null;
    if (!d) return 'Opened —';
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return `Opened ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return `Opened ${d.toLocaleDateString([], {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })}`;
  } catch {
    return 'Opened —';
  }
}

const FormCard: React.FC<Props> = ({ form, onShare, onDelete, onRename }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });
 
  const navigate = useNavigate();

  const openedText = useMemo(
    () => formatOpened(form.lastOpenedAt ?? form.updatedAt ?? form.createdAt),
    [form.lastOpenedAt, form.updatedAt, form.createdAt]
  );

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // Close or reposition menu on scroll/resize to avoid clipping issues
  useEffect(() => {
    if (!menuOpen) return;
    const onScroll = () => setMenuOpen(false);
    const onResize = () => setMenuOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  // Ensure only one dropdown is open at a time across all cards
  useEffect(() => {
    const handler = () => setMenuOpen(false);
    window.addEventListener('pf-close-menus', handler as any);
    return () => window.removeEventListener('pf-close-menus', handler as any);
  }, []);

  const menuItemClasses =
    "flex items-center w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 transition-colors duration-150";

  return (
    <motion.div
      whileHover={{ y: -5, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }}
      className="group relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
      role="button"
      tabIndex={0}
      onClick={() => {
        markFormOpened(form.id).catch(() => {});
        navigate(`/form/${form.id}/edit`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          markFormOpened(form.id).catch(() => {});
          navigate(`/form/${form.id}/edit`);
        }
      }}
    >
      <Card className="overflow-hidden">
      {/* Theme-aware thumbnail */}
      <div
        className="h-40 w-full relative"
        style={{
          background: `linear-gradient(135deg, ${form.theme_background_color || '#F8FAFF'} 0%, #FFFFFF 70%)`,
        }}
        aria-label="Form theme preview"
      >
        {/* Primary color top bar */}
        <div
          className="absolute left-0 right-0 top-0 h-10"
          style={{ backgroundColor: form.theme_primary_color || '#E5E7EB' }}
          aria-hidden="true"
        />
        {/* Abstract content lines */}
        <div className="relative p-4 space-y-2">
          <div
            className="h-2 w-1/2 rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}
          />
          <div
            className="h-2 w-full rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
          />
          <div
            className="h-2 w-full rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
          />
          <div
            className="h-2 w-3/4 rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-neutral-800">
              {form.title || 'Untitled form'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-neutral-500" />
                <span className="truncate">{openedText}</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-neutral-500" />
                <span>{typeof form.responseCount === 'number' && form.responseCount > 0 ? `${form.responseCount} Responses` : 'No responses yet'}</span>
              </span>
            </div>
          </div>

          <div className="relative">
            <span ref={btnRef}>
              <Button
                type="button"
                variant="secondary"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="More actions"
                onClick={(e) => {
                  e.stopPropagation();
                  // Close any other open menus before toggling this one
                  window.dispatchEvent(new Event('pf-close-menus'));
                  const el = btnRef.current;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    const menuWidth = 224; // w-56
                    let left = rect.right - menuWidth;
                    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
                    const belowTop = rect.bottom + 6;
                    const estHeight = 200;
                    const openUp = belowTop + estHeight > window.innerHeight;
                    const top = openUp ? Math.max(8, rect.top - 6 - estHeight) : belowTop;
                    setMenuPos({ top, left, openUp });
                  }
                  setMenuOpen((v) => !v);
                }}
                className="h-8 w-8 p-0"
              >
                <MoreVertical className="h-5 w-5 text-neutral-700" />
              </Button>
            </span>

            {menuOpen && createPortal(
              <>
                {/* Click-catcher to prevent interaction with cards and to consistently close the menu */}
                <div className="fixed inset-0 z-[9998] bg-transparent" onClick={() => setMenuOpen(false)} />
                <div
                  ref={menuRef}
                  role="menu"
                  onClick={(e) => e.stopPropagation()}
                  className="fixed z-[10000] w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white text-sm shadow-md"
                  style={{ top: Math.round(menuPos.top), left: Math.round(menuPos.left) }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClasses}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onRename(form.id, form.title || 'Untitled form');
                    }}
                  >
                    <TextCursorInput className="h-4 w-4 text-neutral-700" />
                    <span className="ml-2">Rename</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClasses}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onShare(form.id);
                    }}
                  >
                    <Share2 className="h-4 w-4 text-neutral-700" />
                    <span className="ml-2">Share</span>
                  </button>

                  <Link
                    to={`/form/${form.id}/edit`}
                    role="menuitem"
                    target="_blank"
                    rel="noreferrer noopener"
                    className={menuItemClasses}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      markFormOpened(form.id).catch(() => {});
                    }}
                  >
                    <ExternalLink className="h-4 w-4 text-slate-700" />
                    <span className="ml-2">Open in new tab</span>
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClasses}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(form.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-neutral-700" />
                    <span className="ml-2">Delete</span>
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </div>
    </Card>
  </motion.div>
  );
};

export default FormCard;