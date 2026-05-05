import { useEffect, useState } from 'react';
import { getUserBadges, type UserBadge } from '../services/progress';

export default function BadgeShelf() {
  const [badges, setBadges] = useState<UserBadge[]>([]);

  useEffect(() => {
    getUserBadges().then(setBadges).catch(() => {});
  }, []);

  if (badges.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800/60">
      <h2 className="mb-4 text-base font-bold text-slate-800 dark:text-slate-100">
        🏅 Значки
      </h2>
      <div className="flex flex-wrap gap-3">
        {badges.map(badge => (
          <div
            key={badge.key}
            title={badge.description}
            className="group relative flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:scale-105 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800"
          >
            <span className="text-2xl">{badge.emoji}</span>
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              {badge.title}
            </span>
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
              {badge.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
