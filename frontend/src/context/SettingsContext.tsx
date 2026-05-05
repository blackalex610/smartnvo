import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type AppLanguage = 'en' | 'bg';
export type DashboardLayout = 'coach' | 'classic';

type SettingsContextValue = {
  theme: ThemeMode;
  language: AppLanguage;
  dashboardLayout: DashboardLayout;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: AppLanguage) => void;
  setDashboardLayout: (layout: DashboardLayout) => void;
};

const THEME_STORAGE_KEY = 'app_theme_mode';
const LANGUAGE_STORAGE_KEY = 'app_language';
const DASHBOARD_LAYOUT_KEY = 'app_dashboard_layout';

const SettingsContext = createContext<SettingsContextValue | null>(null);

const getStoredTheme = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
};

const getStoredLanguage = (): AppLanguage => {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === 'en' ? 'en' : 'bg';
};

const getStoredDashboardLayout = (): DashboardLayout => {
  const stored = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
  return stored === 'classic' ? 'classic' : 'coach';
};

export const SettingsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const [language, setLanguageState] = useState<AppLanguage>(() => getStoredLanguage());
  const [dashboardLayout, setDashboardLayoutState] = useState<DashboardLayout>(() => getStoredDashboardLayout());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === 'bg' ? 'bg' : 'en';
  }, [language]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, dashboardLayout);
  }, [dashboardLayout]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      theme,
      language,
      dashboardLayout,
      isSettingsOpen,
      openSettings: () => setIsSettingsOpen(true),
      closeSettings: () => setIsSettingsOpen(false),
      toggleTheme: () => setThemeState((current) => (current === 'light' ? 'dark' : 'light')),
      setTheme: setThemeState,
      setLanguage: setLanguageState,
      setDashboardLayout: setDashboardLayoutState,
    }),
    [theme, language, dashboardLayout, isSettingsOpen]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};