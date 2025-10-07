import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { StoredForm } from '../../services/forms';
import PublicFormRenderer from '../PublicFormRenderer';
import { FileText, MoreVertical, Share2, Trash2, ExternalLink, TextCursorInput } from 'lucide-react';
import { motion } from 'framer-motion';
import Card from '../ui/Card';
import Button from '../ui/Button';

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
    () => formatOpened(form.updatedAt ?? form.createdAt),
    [form.updatedAt, form.createdAt]
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

  return (
    <motion.div
      whileHover={{ y: -5, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }}
      className="group relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/form/${form.id}/edit`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/form/${form.id}/edit`);
        }
      }}
    >
      <Card className="overflow-hidden">
      {/* Visual preview */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-50">
        {/* Scale wrapper: width 400% + scale .25 to create a miniature */}
        <div
          className="origin-top-left"
          style={{
            width: '400%',
            transform: 'scale(0.25)',
            pointerEvents: 'none',
          }}
        >
          <PublicFormRenderer formData={form.form} formId={form.id} />
        </div>

        {/* subtle bottom divider to mimic Google Forms card split */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[1px] bg-gray-200" />
      </div>

      {/* Footer */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-neutral-800">
              {form.title || 'Untitled form'}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
              <FileText className="h-4 w-4 text-neutral-500" />
              <span className="truncate">{openedText}</span>
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
                  const el = btnRef.current;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    const menuWidth = 192; // w-48
                    let left = rect.right - menuWidth;
                    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
                    const belowTop = rect.bottom + 6;
                    const estHeight = 180;
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

            {menuOpen && (
              <div
                ref={menuRef}
                role="menu"
                onClick={(e) => e.stopPropagation()}
                className="fixed z-[9999] w-48 overflow-visible rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
                style={{ top: menuPos.top, left: menuPos.left }}
              >
                <Button
                  type="button"
                  role="menuitem"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onRename(form.id, form.title || 'Untitled form');
                  }}
                >
                  <TextCursorInput className="h-4 w-4 text-neutral-700" /> Rename
                </Button>

                <Button
                  type="button"
                  role="menuitem"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onShare(form.id);
                  }}
                >
                  <Share2 className="h-4 w-4 text-neutral-700" /> Share
                </Button>

                <Link
                  to={`/form/${form.id}/edit`}
                  role="menuitem"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                >
                  <ExternalLink className="h-4 w-4 text-slate-700" /> Open in new tab
                </Link>

                <Button
                  type="button"
                  role="menuitem"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete(form.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-neutral-700" /> Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  </motion.div>
  );
};

export default FormCard;