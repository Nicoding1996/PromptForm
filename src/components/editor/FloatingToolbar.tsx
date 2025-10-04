import React, { useCallback, useEffect, useState } from 'react';
import { PlusCircle, Heading2 } from 'lucide-react';

type Props = {
  onAddField: () => void;
  onAddSection?: () => void;
  focusedFieldIndex: number | null;
  // Optional tuning
  gutter?: number; // px distance from the editor container's right edge
  revertThreshold?: number; // px scrolled before reverting from stick -> center
};

const SHEET_ID = 'form-editor-sheet';
const CONTAINER_FALLBACK_ID = 'form-editor-container';

const FloatingToolbar: React.FC<Props> = ({
  onAddField,
  onAddSection,
  focusedFieldIndex,
  gutter = 12,
  revertThreshold = 220,
}) => {
  // Toolbar can be in two modes:
  // - 'center' (default): vertically centered in viewport on the right of the editor container
  // - 'stick': vertically attached to the focused question card
  const [mode, setMode] = useState<'center' | 'stick'>('center');

  // Track left offset positioned just outside the white sheet (so it sits in the grey gutter)
  const [left, setLeft] = useState<number>(0);

  // Top in absolute page coordinates when in 'stick' mode
  const [top, setTop] = useState<number>(window.scrollY + window.innerHeight / 2);

  // Record scroll position when entering stick mode to know when to revert back to center
  const [stickyStartY, setStickyStartY] = useState<number>(window.scrollY);

  const clampTop = (absTop: number) => {
    const max = window.scrollY + window.innerHeight - 140;
    const min = window.scrollY + 80;
    return Math.max(min, Math.min(absTop, max));
  };

  const computeRight = useCallback(() => {
    const target =
      document.getElementById(SHEET_ID) ||
      document.getElementById(CONTAINER_FALLBACK_ID);
    const rect = target?.getBoundingClientRect();
    if (!rect) {
      // Fallback: pin near the viewport's right edge with a small padding
      setLeft(Math.max(8, window.innerWidth - 64));
      return;
    }
    // Position the toolbar OUTSIDE the white sheet, hugging its right edge.
    // Use a fixed left coordinate based on the sheet's right + gutter, clamped to viewport.
    const desired = rect.right + gutter;
    const maxLeft = Math.max(8, window.innerWidth - 64); // 64px allowance for toolbar width + margin
    setLeft(Math.min(desired, maxLeft));
  }, [gutter]);

  const questionCenterTop = useCallback((index: number | null) => {
    if (index == null) return window.scrollY + window.innerHeight / 2;
    const el = document.getElementById(`field-${index}`);
    if (!el) return window.scrollY + window.innerHeight / 2;
    const r = el.getBoundingClientRect();
    return window.scrollY + r.top + r.height / 2 - 40;
  }, []);

  // When the focused question changes, stick to it (if present) or revert to center
  useEffect(() => {
    computeRight();
    if (focusedFieldIndex != null) {
      setMode('stick');
      setStickyStartY(window.scrollY);
      setTop(clampTop(questionCenterTop(focusedFieldIndex)));
    } else {
      setMode('center');
    }
  }, [focusedFieldIndex, computeRight, questionCenterTop]);

  // Keep right offset updated on resize
  useEffect(() => {
    computeRight();
    const onResize = () => computeRight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeRight]);

  // Scroll behavior:
  // - In center mode: do nothing (CSS keeps it centered)
  // - In stick mode: follow the question center; if scrolled beyond threshold, revert to center
  useEffect(() => {
    const onScroll = () => {
      if (mode === 'stick') {
        const delta = Math.abs(window.scrollY - stickyStartY);
        if (delta > revertThreshold) {
          setMode('center');
          return;
        }
        setTop(clampTop(questionCenterTop(focusedFieldIndex)));
      }
      // In center mode we don't move; CSS keeps top: 50% transform
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [mode, stickyStartY, revertThreshold, focusedFieldIndex, questionCenterTop]);

  // Compute style based on mode
  const style: React.CSSProperties =
    mode === 'center'
      ? { left, top: '50%', transform: 'translateY(-50%)' }
      : { left, top, transform: undefined };

  return (
    <div
      className="fixed z-40 flex flex-col gap-2 rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-200"
      style={style}
      aria-label="Form actions"
    >
      <button
        type="button"
        onClick={onAddField}
        title="Add question"
        aria-label="Add question"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-50"
      >
        <PlusCircle className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => onAddSection?.()}
        title="Add section"
        aria-label="Add section"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-50"
      >
        <Heading2 className="h-5 w-5" />
      </button>
    </div>
  );
};

export default FloatingToolbar;