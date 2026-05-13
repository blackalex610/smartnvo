import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useXp } from '../context/XpContext';
import { usePlan } from '../hooks/usePlan';
import { useSettings } from '../context/SettingsContext';

const navItems = [
  { icon: '🏠', label: 'Табло', path: '/dashboard' },
  { icon: '📖', label: 'Теория', path: '/learn/grades' },
  { icon: '✏️', label: 'Упражнения', path: '/grades' },
  { icon: '📝', label: 'НВО Изпити', path: '/nvo/practice' },
  { icon: '📈', label: 'Прогрес', path: '/progress' },
];

const AppSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { xpSummary } = useXp();
  const { status: planStatus } = usePlan();
  const { openSettings } = useSettings();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') ?? '{}') as { name?: string };
    } catch {
      return {};
    }
  }, []);

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname.startsWith(path);

  const displayName = user.name?.split(' ')[0] ?? 'Играч';

  return (
    <>
    {/* Mobile bottom nav */}
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex lg:hidden items-center justify-around border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-1 py-1 safe-area-bottom">
      {navItems.map(item => {
        const active = isActive(item.path);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition-all ${
              active
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="truncate max-w-[52px]">{item.label}</span>
          </button>
        );
      })}
    </nav>

    <aside
      className={`hidden lg:flex shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? 'w-16' : 'w-56'
      } overflow-hidden`}
    >
      {/* Header */}
      <div className={`flex items-center border-b border-slate-100 px-2 py-3 dark:border-slate-800 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title={collapsed ? 'Разшири' : 'Свий'}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />}
          </svg>
          {!collapsed && <span className="text-xs font-semibold">Collapse</span>}
        </button>
      </div>

      <div className={`border-b border-slate-100 px-2 py-3 dark:border-slate-800 ${collapsed ? 'px-1.5' : ''}`}>
        <div className={`rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 ${collapsed ? 'px-2 py-3' : 'px-3 py-3.5'}`}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Lvl</span>
              <span className="text-lg font-black text-blue-600 dark:text-blue-300">{xpSummary?.level ?? 1}</span>
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{xpSummary?.total_xp ?? 0} XP</span>
              {(xpSummary?.streak_days ?? 0) > 1 && (
                <span className="text-sm" title={`${xpSummary!.streak_days} дни серия`}>🔥</span>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{displayName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Level {xpSummary?.level ?? 1}</p>
                </div>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {xpSummary?.total_xp ?? 0} XP
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-400 transition-all duration-700"
                  style={{ width: `${xpSummary?.progress_percentage ?? 0}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{xpSummary?.xp_into_level ?? 0} XP in level</span>
                <span>{xpSummary?.xp_to_next_level ?? 100} to next</span>
              </div>
              {(xpSummary?.streak_days ?? 0) > 1 && (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-orange-50 px-2 py-1 dark:bg-orange-900/20">
                  <span className="text-base">🔥</span>
                  <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                    {xpSummary!.streak_days} дни серия
                  </span>
                  <span className="ml-auto text-[10px] font-medium text-orange-500 dark:text-orange-500">
                    ×{xpSummary!.streak_multiplier.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 px-2 py-3">
        {navItems.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold transition-all ${
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0 text-2xl leading-none">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Logo mark at bottom when collapsed */}
      {collapsed && (
        <div className="border-t border-slate-100 p-2 text-center dark:border-slate-800">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">SN</span>
        </div>
        )}

        {/* Daily usage + upgrade (desktop, not collapsed) */}
        {!collapsed && !planStatus.is_premium && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Дневно използване</p>
            {([
              { key: 'ai_exercises', label: 'AI задачи', icon: '✏️' },
              { key: 'ai_chat',      label: 'AI чат',    icon: '💬' },
              { key: 'nvo_exams',    label: 'НВО',       icon: '📝' },
              { key: 'image_scans',  label: 'Снимки',    icon: '📷' },
            ] as const).map(({ key, label, icon }) => {
              const u = planStatus.usage[key];
              const pct = Math.min(100, (u.used / u.limit) * 100);
              const warn = pct >= 80;
              const full = u.remaining === 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                    <span>{icon} {label}</span>
                    <span className={full ? 'text-red-500 font-bold' : warn ? 'text-orange-500 font-semibold' : ''}>
                      {u.used}/{u.limit}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        full ? 'bg-red-500' : warn ? 'bg-orange-400' : 'bg-blue-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => {
                window.location.hash = 'upgrade';
                openSettings();
              }}
              className="w-full mt-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:from-amber-500 hover:to-orange-600 transition-all"
            >
              ⚡ Надградете до Premium
            </button>
          </div>
        )}
        {!collapsed && planStatus.is_premium && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2">
            <div className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 px-2.5 py-2">
              <span className="text-sm">⚡</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Premium</span>
            </div>
          </div>
        )}
    </aside>
    </>
  );
};

export default AppSidebar;
