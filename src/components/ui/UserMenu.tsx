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
        className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        aria-label="Sign in with Google"
        title="Sign in with Google"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 533.5 544.3" className="h-4 w-4" aria-hidden="true">
          <path fill="#4285F4" d="M533.5 278.4c0-17.4-1.6-34.1-4.7-50.3H272v95.2h146.9c-6.3 34-25 62.8-53.4 82v68.2h86.3c50.6-46.6 81.7-115.3 81.7-195.1z"/>
          <path fill="#34A853" d="M272 544.3c73.9 0 135.9-24.5 181.3-66.7l-86.3-68.2c-24 16.1-54.7 25.7-95 25.7-72.9 0-134.8-49.2-157-115.4h-90v72.4C69.4 478.7 163.8 544.3 272 544.3z"/>
          <path fill="#FBBC05" d="M115 319.7c-11.3-34-11.3-70.7 0-104.7v-72.4h-90c-37.7 75.4-37.7 174.1 0 249.5l90-72.4z"/>
          <path fill="#EA4335" d="M272 106.1c39.9-.6 78.3 14.7 107.7 42.9l80.3-80.3C408.1 24.2 345.9-.1 272 0 163.8 0 69.4 65.6 25 159.9l90 72.4C137.2 166.1 199.1 116.9 272 116.9z"/>
        </svg>
        <span>Sign In with Google</span>
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