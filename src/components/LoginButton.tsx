import React from 'react';
import { useAuth } from '../context/AuthContext';

const LoginButton: React.FC = () => {
  const { user, initializing, loginWithGoogle, logout } = useAuth();

  if (initializing) {
    return (
      <button
        type="button"
        className="inline-flex items-center rounded-md bg-gray-200 px-3 py-1.5 text-sm text-gray-700"
        disabled
      >
        Loading...
      </button>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={loginWithGoogle}
        className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Login with Google
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      {user.photoURL ? (
        <img
          src={user.photoURL}
          alt={user.displayName ?? 'User'}
          className="h-7 w-7 rounded-full ring-1 ring-gray-200"
        />
      ) : (
        <div className="h-7 w-7 rounded-full bg-indigo-600 text-white grid place-items-center text-xs">
          {(user.displayName ?? user.email ?? 'U').slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="text-sm text-gray-800">{user.displayName ?? user.email}</span>
      <button
        type="button"
        onClick={logout}
        className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
        title="Logout"
      >
        Logout
      </button>
    </div>
  );
};

export default LoginButton;