/** Miniature static preview of the dashboard for the login page hero. */
export default function DashboardPreviewMockup() {
  const navItems = [
    { icon: '🏠', label: 'Табло', active: true },
    { icon: '📖', label: 'Теория' },
    { icon: '✏️', label: 'Упражнения' },
    { icon: '📝', label: 'НВО Изпити' },
    { icon: '📈', label: 'Прогрес' },
  ];

  const usageItems = [
    { icon: '✏️', label: 'AI задачи' },
    { icon: '💬', label: 'AI чат' },
    { icon: '📝', label: 'НВО' },
    { icon: '📷', label: 'Снимки' },
  ];

  const statCards = [
    { icon: '🎓', value: '0/0', label: 'Теми завършени', bar: 'bg-blue-500' },
    { icon: '🎯', value: '0%', label: 'Средна точност', bar: 'bg-red-400' },
    { icon: '✅', value: '0', label: 'Задачи решени', bar: 'bg-violet-400' },
    { icon: '⚠️', value: '0', label: 'Слаби теми', bar: 'bg-amber-400' },
  ];

  const actionCards = [
    { icon: '📘', label: 'Теория', className: 'border-blue-700/40 bg-gradient-to-br from-blue-900/40 to-cyan-900/20 text-blue-300' },
    { icon: '✏️', label: 'Практика', className: 'border-violet-700/40 bg-gradient-to-br from-violet-900/40 to-fuchsia-900/20 text-violet-300' },
    { icon: '📈', label: 'Прогрес', className: 'border-slate-600/40 bg-gradient-to-br from-slate-800/60 to-slate-900/40 text-slate-300' },
    { icon: '📝', label: 'НВО', className: 'border-rose-700/40 bg-gradient-to-br from-rose-900/40 to-orange-900/20 text-rose-300' },
  ];

  return (
    <div className="flex h-full min-h-[460px] flex-col overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0a0e1a] shadow-2xl shadow-black/40">
      {/* Top navbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#111827] px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-[9px] text-white/60">
            ⌂
          </div>
          <span className="text-[10px] font-bold text-white/80">SMART NVO ∑</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[8px] font-semibold text-white/50">
            Настройки
          </div>
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5">
            <div className="h-4 w-4 rounded-full bg-white/10" />
            <span className="text-[8px] font-medium text-white/50">Гост</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-[118px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0f172a]">
          {/* Profile card */}
          <div className="border-b border-white/[0.06] p-2">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2">
              <div className="flex items-start justify-between gap-1">
                <div>
                  <p className="text-[9px] font-bold text-white/90">Гост</p>
                  <p className="text-[7px] text-white/40">Level 1</p>
                </div>
                <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[7px] font-bold text-blue-300">0 XP</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-0 rounded-full bg-gradient-to-r from-blue-500 to-amber-400" />
              </div>
              <div className="mt-1 flex justify-between text-[6px] text-white/30">
                <span>0 XP in level</span>
                <span>100 to next</span>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 p-1.5">
            {navItems.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 ${
                  item.active ? 'bg-blue-500/15 text-blue-300' : 'text-white/35'
                }`}
              >
                <span className="text-[11px] leading-none">{item.icon}</span>
                <span className="truncate text-[8px] font-semibold">{item.label}</span>
              </div>
            ))}
          </nav>

          {/* Daily usage + premium */}
          <div className="border-t border-white/[0.06] p-2 space-y-1.5">
            <p className="text-[6px] font-bold uppercase tracking-wider text-white/25">Дневно използване</p>
            {usageItems.map((item) => (
              <div key={item.label}>
                <div className="mb-0.5 flex justify-between text-[6px] text-white/30">
                  <span>{item.icon} {item.label}</span>
                  <span>0/5</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-0 rounded-full bg-blue-500" />
                </div>
              </div>
            ))}
            <div className="mt-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-1 text-center text-[7px] font-bold text-white">
              ⚡ Premium
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 overflow-y-auto p-2.5 space-y-2.5 bg-[#0a0e1a]">
          {/* Hero welcome card */}
          <div className="rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-violet-600 p-3 text-white shadow-lg shadow-blue-900/30">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[7px] font-medium text-blue-100/80">Добре дошъл обратно 👋</p>
                <p className="mt-0.5 text-[13px] font-extrabold leading-tight">Гост</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="rounded-lg bg-white/15 px-1.5 py-0.5 text-[7px] font-semibold">⭐ Ниво 1</span>
                  <span className="rounded-lg bg-white/15 px-1.5 py-0.5 text-[7px] font-semibold">⚡ +0 XP днес</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <div className="rounded-lg bg-gradient-to-r from-amber-300 to-orange-300 px-2 py-1 text-[7px] font-extrabold text-slate-900">
                  Решавай →
                </div>
                <div className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-[7px] font-bold">
                  НВО тренировка
                </div>
              </div>
            </div>
            <div className="mt-2 rounded-xl border border-white/15 bg-slate-950/10 px-2.5 py-2">
              <p className="text-[6px] font-semibold uppercase tracking-wider text-blue-100/70">Ниво 1 — XP прогрес</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <div className="flex items-end gap-1">
                  <span className="text-[14px] font-black leading-none">0</span>
                  <span className="pb-0.5 text-[7px] text-blue-100/80">/ 100 XP</span>
                </div>
                <p className="text-[6px] font-semibold text-white/80">Остават 100 XP</p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-0 rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-amber-300" />
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2"
              >
                <div className="mb-1 text-[11px] leading-none">{card.icon}</div>
                <div className="text-[11px] font-extrabold text-white/90">{card.value}</div>
                <div className="mt-0.5 text-[6px] leading-tight text-white/35">{card.label}</div>
                <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full w-0 rounded-full ${card.bar}`} />
                </div>
              </div>
            ))}
          </div>

          {/* Quick action grid */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {actionCards.map((card) => (
                <div
                  key={card.label}
                  className={`rounded-lg border px-1.5 py-2 text-center ${card.className}`}
                >
                  <div className="text-[12px]">{card.icon}</div>
                  <div className="mt-0.5 text-[7px] font-bold">{card.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily missions */}
          <div>
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-[9px]">⚡</span>
              <span className="text-[9px] font-bold text-white/80">Дневни мисии</span>
              <span className="ml-auto text-[7px] text-white/30">Персонализирани</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2">
                  <div className="flex items-start gap-1.5">
                    <div className="h-5 w-5 shrink-0 rounded-lg bg-white/10 animate-pulse" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="h-1.5 w-3/4 rounded-full bg-white/10 animate-pulse" />
                      <div className="h-1 w-1/2 rounded-full bg-white/[0.06] animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
