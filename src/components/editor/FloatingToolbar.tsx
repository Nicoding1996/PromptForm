import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, Heading2 } from 'lucide-react';

type Props = {
  onAddField: () => void;
  onAddSection?: () => void;
  focusedFieldIndex: number | null;
  // Fine-tune offsets
  gutter?: number; // distance from editor card edge (px), default 12
  minViewportTop?: number; // keep within viewport (px), default 80
};

const CONTAINER_ID = 'form-editor-container';

const FloatingToolbar: React.FC<Props> = ({
  onAddField,
  onAddSection,
  focusedFieldIndex,
  gutter = 12,
  minViewportTop = 80,
}) => {
  const [pos, setPos] = useState<{ top: number; right: number }>({
    top: window.scrollY + Math.round(window.innerHeight * 0.3),
    right: 24,
  });

  // Clamp top into viewport
  const clampTop = (absTop: number) => {
    const max = window.scrollY + window.innerHeight - 140;
    const min = window.scrollY + minViewportTop;
    return Math.max(min, Math.min(absTop, max));
  };

  const recalc = useMemo(
    () => () => {
      const container = document.getElementById(CONTAINER_ID);
      const containerRect = container?.getBoundingClientRect();
      // Default right = aligned to the editor container's right edge + gutter
      let right = 24;
      if (containerRect) {
        right = Math.max(8, window.innerWidth - containerRect.right + gutter);
      }

      // Default top around upper third
      let absTop = window.scrollY + Math.round(window.innerHeight * 0.3);

      // If a question is focused, align to its vertical center
      if (focusedFieldIndex != null) {
        const el = document.getElementById(`field-${focusedFieldIndex}`);
        if (el) {
          const r = el.getBoundingClientRect();
          absTop = window.scrollY + r.top + r.height / 2 - 40;
        }
      }

      setPos({ top: clampTop(absTop), right });
    },
    [focusedFieldIndex, gutter, minViewportTop]
  );

  useEffect(() => {
    recalc();
    // Listen to window scroll + any scroll bubbling from inner containers
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [recalc]);

  return (
    <div
      className="fixed z-40 flex flex-col gap-2 rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-200"
      style={{ right: pos.right, top: pos.top }}
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