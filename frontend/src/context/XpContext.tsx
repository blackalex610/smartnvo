import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getXpSummary, type XpSummary } from '../services/progress';

interface XpContextValue {
  xpSummary: XpSummary | null;
  refreshXp: () => void;
}

const XpContext = createContext<XpContextValue>({ xpSummary: null, refreshXp: () => {} });

export const XpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [xpSummary, setXpSummary] = useState<XpSummary | null>(null);

  const refreshXp = useCallback(() => {
    // Skip if not authenticated (prevents 401 redirect loops on login page)
    if (!localStorage.getItem('token')) return;
    getXpSummary()
      .then(setXpSummary)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshXp();
  }, [refreshXp]);

  return (
    <XpContext.Provider value={{ xpSummary, refreshXp }}>
      {children}
    </XpContext.Provider>
  );
};

export const useXp = () => useContext(XpContext);
