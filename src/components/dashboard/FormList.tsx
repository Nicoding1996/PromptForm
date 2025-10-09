import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MoreVertical, MessageSquare, FileText, ExternalLink, Share2, TextCursorInput, Trash2 } from 'lucide-react';
import type { StoredForm } from '../../services/forms';
import { markFormOpened } from '../../services/forms';
import Button from '../ui/Button';

type Props = {
  forms: StoredForm[];
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

const menuItemClasses =
  'flex items-center w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 transition-colors duration-150';

const FormList: React.FC<Props> = ({ forms, onShare, onDelete, onRename }) => {
  const navigate = useNavigate();

  // Dropdown menu state, one menu per list (track which id is open)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const btnRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  // Close on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const btn = btnRefs.current[openMenuId!];
      if (menuRef.current?.contains(target) || btn?.contains(target)) return;
      setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuId]);

  // Close on scroll/resize
  useEffect(() => {
    if (!openMenuId) return;
    const onScroll = () => setOpenMenuId(null);
    const onResize = () => setOpenMenuId(null);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [openMenuId]);

  // Ensure only one dropdown open across app
  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    window.addEventListener('pf-close-menus', handler as any);
    return () => window.removeEventListener('pf-close-menus', handler as any);
  }, []);

  return (
    <div role="list" className="w-full divide-y divide-neutral-200 rounded-md border border-neutral-200">
      {forms.map((form) => {
        const openedText = formatOpened(form.lastOpenedAt ?? form.updatedAt ?? form.createdAt);
        const themeBar = form.theme_primary_color || '#E5E7EB';

        return (
          <div
            key={form.id}
            role="listitem"
            tabIndex={0}
            className="group relative flex items-center gap-4 px-3 py-2 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
            {/* Theme color indicator */}
            <div
              className="h-8 w-1 rounded"
              style={{ backgroundColor: themeBar }}
              aria-hidden="true"
            />

            {/* Title and meta */}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-neutral-900 truncate">
                {form.title || 'Untitled form'}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
                <span className="inline-flex items-center gap-1 min-w-0">
                  <FileText className="h-4 w-4 text-neutral-500" />
                  <span className="truncate">{openedText}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-4 w-4 text-neutral-500" />
                  <span>
                    {typeof form.responseCount === 'number' && form.responseCount > 0
                      ? `${form.responseCount} Responses`
                      : 'No responses yet'}
                  </span>
                </span>
              </div>
            </div>

            {/* Actions menu */}
            <div className="relative">
              <span
                ref={(el: HTMLSpanElement | null) => {
                  btnRefs.current[form.id] = el;
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === form.id}
                  aria-label="More actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Close any other open menus before toggling this one
                    window.dispatchEvent(new Event('pf-close-menus'));
                    const el = btnRefs.current[form.id];
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
                    setOpenMenuId((v) => (v === form.id ? null : form.id));
                  }}
                  className="h-8 w-8 p-0"
                >
                  <MoreVertical className="h-5 w-5 text-neutral-700" />
                </Button>
              </span>

              {openMenuId === form.id &&
                createPortal(
                  <>
                    {/* Click-catcher to close the menu */}
                    <div className="fixed inset-0 z-[9998] bg-transparent" onClick={() => setOpenMenuId(null)} />
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
                          setOpenMenuId(null);
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
                          setOpenMenuId(null);
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
                          setOpenMenuId(null);
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
                          setOpenMenuId(null);
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
        );
      })}
    </div>
  );
};

export default FormList;