import React from 'react';
import { useSettings } from '../context/SettingsContext';
import SettingsSection from './SettingsSection';
import SettingsConnectionPanel from './SettingsConnectionPanel';
import ThemeToggle from './ThemeToggle';

const SettingsModal: React.FC = () => {
  const { isSettingsOpen, closeSettings, theme, setTheme, language, setLanguage, dashboardLayout, setDashboardLayout } = useSettings();

  React.useEffect(() => {
    if (!isSettingsOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSettings();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeSettings, isSettingsOpen]);

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:p-6">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default"
        onClick={closeSettings}
      />

      <div className="relative z-10 mt-10 flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
        <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 via-white to-blue-50 px-6 py-5 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-400">Global preferences</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-slate-100">Settings</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                Personalize appearance and app defaults across the entire experience.
              </p>
            </div>
            <button
              type="button"
              onClick={closeSettings}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-blue-300"
              aria-label="Close settings"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-6">
          <SettingsSection
            title="Appearance"
            description="Choose the interface theme and apply it across the whole app."
          >
            <ThemeToggle value={theme} onChange={setTheme} />
          </SettingsSection>

          <SettingsSection
            title="Language"
            description="Store a preferred language now and wire full translations later."
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">App language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as 'en' | 'bg')}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/20"
              >
                <option value="en">English</option>
                <option value="bg">Bulgarian</option>
              </select>
            </label>
          </SettingsSection>

          <SettingsSection
            title="Dashboard Style"
            description="Choose between the classic summary view or the new AI Coach dashboard."
          >
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDashboardLayout('coach')}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                  dashboardLayout === 'coach'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <div className="text-xl mb-1">🚀</div>
                <div>AI Coach</div>
                <div className="text-xs font-normal opacity-70 mt-0.5">Gamified · Missions · Skill Tree</div>
              </button>
              <button
                type="button"
                onClick={() => setDashboardLayout('classic')}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                  dashboardLayout === 'classic'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <div className="text-xl mb-1">📊</div>
                <div>Classic</div>
                <div className="text-xs font-normal opacity-70 mt-0.5">Stats · Quick links · Overview</div>
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Connection / Pairing"
            description="Create a room on desktop and join it from a phone using a 4-letter code."
          >
            <SettingsConnectionPanel />
          </SettingsSection>
        </div>

        <div className="flex items-center justify-end border-t border-gray-100 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={closeSettings}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;