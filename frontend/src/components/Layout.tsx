import React, { useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ChatSidebar from './ChatSidebar';
import AppSidebar from './AppSidebar';
import BugReportButton from './BugReportButton';

const ASK_ASSISTANT_EVENT = 'ask-assistant-from-selection';

const Layout: React.FC = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const location = useLocation();

  const isAuthPage = useMemo(
    () => location.pathname === '/login' || location.pathname === '/register',
    [location.pathname]
  );

  React.useEffect(() => {
    const openChatFromSelection = () => setIsChatOpen(true);
    window.addEventListener(ASK_ASSISTANT_EVENT, openChatFromSelection as EventListener);
    return () => window.removeEventListener(ASK_ASSISTANT_EVENT, openChatFromSelection as EventListener);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {!isAuthPage && <AppSidebar />}

      <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar pb-16 lg:pb-0">
        <Outlet />
      </div>

      {!isAuthPage && (
        <ChatSidebar
          isOpen={isChatOpen}
          onOpen={() => setIsChatOpen(true)}
          onClose={() => setIsChatOpen(false)}
        />
      )}
      {!isAuthPage && <BugReportButton />}
    </div>
  );
};

export default Layout;
