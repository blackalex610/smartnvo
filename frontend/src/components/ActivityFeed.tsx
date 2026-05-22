import { useEffect, useState } from 'react';
import { getActivityFeed, type ActivityEvent } from '../services/progress';
import { ActivityFeedSkeleton } from './Skeleton';

const SOURCE_EMOJI: Record<string, string> = {
  exercise:  '✏️',
  streak:    '🔥',
  nvo_exam:  '📝',
  mission:   '⚡',
};

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)  return 'преди секунди';
  if (diff < 3600) return `преди ${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `преди ${Math.floor(diff / 3600)} ч`;
  return `преди ${Math.floor(diff / 86400)} д`;
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActivityFeed(15)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityFeedSkeleton />;

  if (events.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800/60">
      <h2 className="mb-4 text-base font-bold text-slate-800 dark:text-slate-100">
        📜 История на XP
      </h2>
      <ul className="space-y-2">
        {events.map(ev => (
          <li key={ev.id} className="flex items-center gap-3 text-sm">
            <span className="text-xl w-7 shrink-0 text-center">
              {SOURCE_EMOJI[ev.source_type] ?? '⭐'}
            </span>
            <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">
              {ev.reason}
            </span>
            <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0">
              +{ev.xp_amount} XP
            </span>
            <span className="text-[11px] text-slate-400 shrink-0 w-24 text-right">
              {timeAgo(ev.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
