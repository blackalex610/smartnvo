import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

interface AppNavbarProps {
  showBack?: boolean;
  backLabel?: string;
  backTo?: string;
  maxWidthClassName?: string;
  sticky?: boolean;
}

type StoredUser = {
  name?: string;
  picture?: string;
  email?: string;
};

const AppNavbar: React.FC<AppNavbarProps> = ({
  showBack = true,
  backLabel = 'Назад',
  backTo,
  maxWidthClassName = 'max-w-none',
  sticky = true,
}) => {
  const navigate = useNavigate();
  const { openSettings } = useSettings();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') ?? '{}') as StoredUser;
    } catch {
      return {};
    }
  }, []);

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
      return;
    }
    navigate(-1);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  return (
    <nav className={`bg-white/90 dark:bg-slate-950/60 backdrop-blur shadow-sm border-b border-transparent dark:border-slate-700/40 z-20 ${sticky ? 'sticky top-0' : ''}`}>
      <div className={`w-full ${maxWidthClassName} mx-auto px-4 sm:px-6`}>
        <div className="flex justify-between h-16 items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-10 h-10 rounded-full border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-gray-700 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-300 dark:hover:border-blue-400/60 transition-colors home-shadow-hover flex items-center justify-center shrink-0"
              aria-label="Начало"
              title="Начало"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10.5l9-7 9 7M5.25 9.75V20.25H18.75V9.75" />
              </svg>
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-xl font-bold tracking-[-0.02em] bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent transition-opacity hover:opacity-80 truncate"
            >
              SMART NVO ∑
            </button>
            {showBack && (
              <button
                onClick={handleBack}
                className="hidden md:inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-400/30 bg-blue-50/90 dark:bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-400/50 transition-colors motion-pill"
              >
                <span aria-hidden="true">←</span>
                {backLabel}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openSettings}
              aria-label="Open settings"
              title="Open settings"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-300 dark:hover:border-blue-400/60 transition-colors motion-pill"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1.724 1.724 0 013.35 0 1.724 1.724 0 002.573 1.066 1.724 1.724 0 012.898 1.675 1.724 1.724 0 001.066 2.573 1.724 1.724 0 010 3.35 1.724 1.724 0 00-1.066 2.573 1.724 1.724 0 01-2.898 1.675 1.724 1.724 0 00-2.573 1.066 1.724 1.724 0 01-3.35 0 1.724 1.724 0 00-2.573-1.066 1.724 1.724 0 01-2.898-1.675 1.724 1.724 0 00-1.066-2.573 1.724 1.724 0 010-3.35 1.724 1.724 0 001.066-2.573 1.724 1.724 0 012.898-1.675 1.724 1.724 0 002.573-1.066z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.25A3.25 3.25 0 1012 8.75a3.25 3.25 0 000 6.5z" />
              </svg>
              <span className="hidden md:inline">Settings</span>
            </button>
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name ?? 'User'}
                className="w-9 h-9 rounded-full border-2 border-blue-200 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-slate-200 hidden sm:block max-w-40 truncate">
              {user.name ?? 'Ученик'}
            </span>
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 px-2.5 py-2 text-sm text-gray-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/60 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
              >
                <span className="hidden sm:inline">▼</span>
                <span className="sm:hidden">⋯</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-30 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      navigate('/progress');
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                    role="menuitem"
                  >
                    Профил
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                    role="menuitem"
                  >
                    Излез
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {showBack && (
          <div className="md:hidden pb-3">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-400/30 bg-blue-50/90 dark:bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-400/50 transition-colors motion-pill"
            >
              <span aria-hidden="true">←</span>
              {backLabel}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default AppNavbar;
