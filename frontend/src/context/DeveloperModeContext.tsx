import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'smartnvo_developer_mode_v1';

interface DeveloperModeContextValue {
  /** Whether developer mode is currently enabled */
  isDevMode: boolean;
  /** Toggle developer mode on/off */
  toggleDevMode: () => void;
  /** Enable developer mode */
  enableDevMode: () => void;
  /** Disable developer mode */
  disableDevMode: () => void;
}

const DeveloperModeContext = createContext<DeveloperModeContextValue | null>(null);

export const DeveloperModeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isDevMode, setIsDevMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isDevMode));
    } catch {
      // Storage might be unavailable (private mode, etc.)
    }
  }, [isDevMode]);

  const toggleDevMode = useCallback(() => {
    setIsDevMode((prev) => !prev);
  }, []);

  const enableDevMode = useCallback(() => {
    setIsDevMode(true);
  }, []);

  const disableDevMode = useCallback(() => {
    setIsDevMode(false);
  }, []);

  const value = useMemo<DeveloperModeContextValue>(
    () => ({
      isDevMode,
      toggleDevMode,
      enableDevMode,
      disableDevMode,
    }),
    [isDevMode, toggleDevMode, enableDevMode, disableDevMode]
  );

  return (
    <DeveloperModeContext.Provider value={value}>
      {children}
    </DeveloperModeContext.Provider>
  );
};

export const useDeveloperMode = (): DeveloperModeContextValue => {
  const context = useContext(DeveloperModeContext);
  if (!context) {
    throw new Error('useDeveloperMode must be used within a DeveloperModeProvider');
  }
  return context;
};

/**
 * Higher-order component that conditionally renders children only in developer mode.
 * Shows a "Developer Only" badge when visible.
 */
export interface DevOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Optional label shown on the badge - defaults to "Developer Only" */
  badgeLabel?: string;
}

/**
 * Wrapper component that shows content only in developer mode.
 * Includes a visual "Developer Only" indicator badge.
 */
export const DevOnly: React.FC<DevOnlyProps> = ({
  children,
  fallback = null,
  badgeLabel = 'Developer Only',
}) => {
  const { isDevMode } = useDeveloperMode();

  if (!isDevMode) {
    return <>{fallback}</>;
  }

  return (
    <div className="relative">
      <div className="absolute -top-2 -right-2 z-10">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 shadow-sm dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          <span className="text-xs">⚠️</span>
          {badgeLabel}
        </span>
      </div>
      <div className="rounded-2xl border-2 border-dashed border-amber-300/50 p-1 dark:border-amber-700/30">
        {children}
      </div>
    </div>
  );
};

/**
 * Hook for components that need to know if they're in dev mode but don't need the full context.
 * Returns boolean for simpler conditional rendering.
 */
export const useIsDevMode = (): boolean => {
  const { isDevMode } = useDeveloperMode();
  return isDevMode;
};
