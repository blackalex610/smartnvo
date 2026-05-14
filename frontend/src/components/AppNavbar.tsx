import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { trackEvent } from '../services/analytics';
import { usePairing } from '../context/PairingContext';

interface AppNavbarProps {
  showBack?: boolean;
  backLabel?: string;
  backTo?: string;
  maxWidthClassName?: string;
  sticky?: boolean;
}

type StoredUser = {
  id?: string | number;
  name?: string;
  picture?: string;
  email?: string;
  isGuest?: boolean;
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
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  const phoneMenuRef = useRef<HTMLDivElement | null>(null);
  const { roomCode, devices, status, ensureRoom, regenerateRoom } = usePairing();
  const isPaired = devices.length > 0;

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') ?? '{}') as StoredUser;
    } catch {
      return {};
    }
  }, []);

  const canUseMobileConnect = Boolean(user.id) && !user.isGuest;

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
      return;
    }
    navigate(-1);
  };

  const handleLogout = () => {
    trackEvent('logout');
    localStorage.removeItem('user');
    navigate('/login');
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
      if (phoneMenuRef.current && !phoneMenuRef.current.contains(event.target as Node)) {
        setPhoneMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        setPhoneMenuOpen(false);
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
    <nav className={`bg-white border-b border-[#d4eae2] z-20 ${sticky ? 'sticky top-0' : ''}`}>
      <div className={`w-full ${maxWidthClassName} mx-auto px-4 sm:px-6`}>
        <div className="flex justify-between h-14 items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-9 h-9 rounded-lg border border-[#b8ddd0] bg-[#e8f8f0] text-[#2a7a8c] hover:bg-[#d0f0e4] hover:border-[#5bba8e] transition-colors flex items-center justify-center shrink-0"
              aria-label="Начало"
              title="Начало"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10.5l9-7 9 7M5.25 9.75V20.25H18.75V9.75" />
              </svg>
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-lg font-bold tracking-tight text-[#1c4270] hover:text-[#2a7a8c] transition-colors truncate"
            >
              SMART NVO ∑
            </button>
            {showBack && (
              <button
                onClick={handleBack}
                className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-[#b8ddd0] bg-[#e8f8f0] px-3 py-1.5 text-sm font-semibold text-[#2a7a8c] hover:bg-[#d0f0e4] hover:border-[#5bba8e] transition-colors"
              >
                <span aria-hidden="true">←</span>
                {backLabel}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* ── Phone connect button ── */}
            {canUseMobileConnect && (
              <div className="relative" ref={phoneMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    const next = !phoneMenuOpen;
                    setPhoneMenuOpen(next);
                    if (next) void ensureRoom();
                  }}
                  aria-label="Свържи телефон"
                  title="Свържи телефон"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isPaired
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'border-[#b8ddd0] bg-[#e8f8f0] text-[#2a7a8c] hover:bg-[#d0f0e4] hover:border-[#5bba8e]'
                  }`}
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  <span className="hidden md:inline">{isPaired ? `📱 ${devices[0].name}` : 'Свържи'}</span>
                  {isPaired && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                </button>

                {phoneMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-[#d4eae2] bg-white shadow-xl z-30 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-[#2a7a8c] dark:text-blue-300">Свърши телефон</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isPaired ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : status === 'connecting' ? 'bg-amber-100 text-amber-700'
                        : status === 'error' ? 'bg-red-100 text-red-600'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {isPaired ? '● Свързан' : status === 'connecting' ? '● Свързване…' : status === 'error' ? '● Грешка' : '● Чака'}
                      </span>
                    </div>

                    {isPaired ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/20">
                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">📱 {devices[0].name}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Свързан от {new Date(devices[0].joinedAt).toLocaleTimeString()}</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Отвори <span className="font-semibold text-[#2a7a8c]">/controller</span> на телефона и въведи кода:</p>
                        <div className="flex items-center gap-1.5">
                          {roomCode ? roomCode.split('').map((ch, i) => (
                            <div key={i} className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-slate-50 text-lg font-black text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">{ch}</div>
                          )) : (
                            <p className="text-xs text-slate-400">Генериране…</p>
                          )}
                          <button
                            type="button"
                            onClick={() => void regenerateRoom()}
                            className="ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            title="Нов код"
                          >↺</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={openSettings}
              aria-label="Open settings"
              title="Open settings"
              className="inline-flex items-center gap-2 rounded-lg border border-[#b8ddd0] bg-[#e8f8f0] px-3 py-1.5 text-sm font-semibold text-[#2a7a8c] hover:bg-[#d0f0e4] hover:border-[#5bba8e] transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1.724 1.724 0 013.35 0 1.724 1.724 0 002.573 1.066 1.724 1.724 0 012.898 1.675 1.724 1.724 0 001.066 2.573 1.724 1.724 0 010 3.35 1.724 1.724 0 00-1.066 2.573 1.724 1.724 0 01-2.898 1.675 1.724 1.724 0 00-2.573 1.066 1.724 1.724 0 01-3.35 0 1.724 1.724 0 00-2.573-1.066 1.724 1.724 0 01-2.898-1.675 1.724 1.724 0 00-1.066-2.573 1.724 1.724 0 010-3.35 1.724 1.724 0 001.066-2.573 1.724 1.724 0 012.898-1.675 1.724 1.724 0 002.573-1.066z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.25A3.25 3.25 0 1012 8.75a3.25 3.25 0 000 6.5z" />
              </svg>
              <span className="hidden md:inline">Настройки</span>
            </button>
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name ?? 'User'}
                className="w-8 h-8 rounded-lg border-2 border-[#b8ddd0] object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#2a7a8c] flex items-center justify-center text-white font-bold text-xs">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <span className="text-sm font-medium text-[#1c4270] hidden sm:block max-w-36 truncate">
              {user.name ?? 'Ученик'}
            </span>
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#b8ddd0] bg-[#e8f8f0] px-2.5 py-1.5 text-sm text-[#2a7a8c] hover:bg-[#d0f0e4] hover:border-[#5bba8e] transition-colors"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
              >
                <span className="hidden sm:inline">▼</span>
                <span className="sm:hidden">⋯</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl border border-[#d4eae2] bg-white shadow-md z-30 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      navigate('/progress');
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-[#1c4270] hover:bg-[#e8f8f0]"
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
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#b8ddd0] bg-[#e8f8f0] px-3 py-1.5 text-sm font-semibold text-[#2a7a8c] hover:bg-[#d0f0e4] transition-colors"
            >
              <span aria-hidden="true">←</span>
              {backLabel}
            </button>
          </div>
        )}
        {canUseMobileConnect && (
          <div className="md:hidden pb-3">
            <button
              type="button"
              onClick={() => navigate('/controller')}
              className="flex w-full items-center justify-center rounded-xl bg-[#2a7a8c] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#1c4270]"
            >
              Свържи телефон
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default AppNavbar;
