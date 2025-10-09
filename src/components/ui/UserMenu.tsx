import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Card from './Card';

const UserMenu: React.FC = () => {
  const { user, initializing, loginWithGoogle, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (initializing) {
    return (
      <div className="h-8 w-8 rounded-full bg-neutral-200 animate-pulse" aria-label="Loading user" />
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={loginWithGoogle}
        className="inline-flex items-center rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
      >
        Login or Sign Up with Google
      </button>
    );
  }

  const avatar = user.photoURL ? (
    <img
      src={user.photoURL}
      alt={user.displayName ?? 'User'}
      className="h-8 w-8 rounded-full ring-1 ring-neutral-200 object-cover"
    />
  ) : (
    <div className="grid h-8 w-8 place-items-center rounded-full bg-primary-600 text-xs font-semibold text-white ring-1 ring-neutral-200">
      {(user.displayName ?? user.email ?? 'U').slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center"
        title={user.displayName ?? user.email ?? 'Account'}
      >
        {avatar}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute right-0 z-50 mt-2 w-48"
          >
            <Card className="border border-neutral-200 shadow-md overflow-hidden">
              <div className="px-3 py-2 text-xs text-neutral-500">
                {user.displayName ?? user.email}
              </div>
              <Link
                to="/account"
                className="block px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Account Settings
              </Link>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-danger-700 hover:bg-neutral-50"
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  try {
                    await logout();
                  } catch {}
                }}
              >
                Logout
              </button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserMenu;