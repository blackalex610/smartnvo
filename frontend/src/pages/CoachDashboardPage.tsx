import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, getRecommendations, getXpSummary, recordActivity, getDailyMissions, type DashboardStats, type ProgressRecommendations, type XpSummary, type DailyMission } from '../services/progress';
import { useXp } from '../context/XpContext';
import AppNavbar from '../components/AppNavbar';
import BadgeShelf from '../components/BadgeShelf';
import { useIsDevMode } from '../context/DeveloperModeContext';
import { SkeletonCard, Bone } from '../components/Skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

type Grade = 5 | 6 | 7;

// ─── Component ────────────────────────────────────────────────────────────────

const DASHBOARD_CACHE_KEY = 'dashboard_cache_v1';
const CACHE_FRESH_MS = 5 * 60 * 1000; // 5 min — background refresh if stale

interface DashboardCache {
  stats: DashboardStats;
  recommendations: ProgressRecommendations;
  xpSummary: XpSummary;
  missions: DailyMission[];
  savedAt: number;
}

function readCache(): DashboardCache | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardCache;
  } catch { return null; }
}

function isCacheFresh(cache: DashboardCache | null): boolean {
  return cache !== null && Date.now() - cache.savedAt < CACHE_FRESH_MS;
}

function writeCache(data: Omit<DashboardCache, 'savedAt'>) {
  try { localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); }
  catch { /* storage full — ignore */ }
}

const CoachDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const isDevMode = useIsDevMode();

  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}') as { name?: string; picture?: string; email?: string }; }
    catch { return {}; }
  }, []);

  const firstName = user.name?.split(' ')[0] ?? 'Студент';

  const [_activeGrade] = useState<Grade>(5);
  const [stats, setStats] = useState<DashboardStats | null>(() => readCache()?.stats ?? null);
  const [recommendations, setRecommendations] = useState<ProgressRecommendations | null>(() => readCache()?.recommendations ?? null);
  const [xpSummary, setXpSummary] = useState<XpSummary | null>(() => readCache()?.xpSummary ?? null);
  const [missions, setMissions] = useState<DailyMission[]>(() => readCache()?.missions ?? []);
  const [loading, setLoading] = useState(() => readCache() === null);
  const { refreshXp } = useXp();

  useEffect(() => {
    (async () => {
      const cached = readCache();
      // Only show spinner when there is truly nothing to display
      if (!cached) setLoading(true);
      // Skip network fetch entirely if cache is still fresh
      if (isCacheFresh(cached)) { setLoading(false); return; }
      try {
        // record-activity updates streak and returns fresh XP summary
        const [s, r, x, m] = await Promise.allSettled([getDashboardStats(), getRecommendations(), recordActivity(), getDailyMissions()]);
        const newStats = s.status === 'fulfilled' ? s.value : stats;
        const newRecs  = r.status === 'fulfilled' ? r.value : recommendations;
        let   newXp    = x.status === 'fulfilled' ? x.value : null;
        if (!newXp) newXp = await getXpSummary().catch(() => null);
        const newMissions = m.status === 'fulfilled' ? m.value : missions;
        if (newStats)    setStats(newStats);
        if (newRecs)     setRecommendations(newRecs);
        if (newXp)       setXpSummary(newXp);
        if (newMissions) setMissions(newMissions);
        if (newStats && newRecs && newXp && newMissions) {
          writeCache({ stats: newStats, recommendations: newRecs, xpSummary: newXp, missions: newMissions });
        }
        refreshXp();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const accuracy = stats?.accuracy_percentage ?? 0;
  const nvoReadiness = Math.min(100, Math.round(accuracy * 0.6 + (stats?.topics_completed ?? 0) * 2));
  const currentLevelXp = xpSummary?.current_level_xp ?? 0;
  const nextLevelXp = xpSummary?.next_level_xp ?? 100;
  const totalXp = xpSummary?.total_xp ?? 0;
  const todayXp = xpSummary?.today_xp ?? 0;
  const level = xpSummary?.level ?? 1;
  const xpIntoLevel = xpSummary?.xp_into_level ?? 0;
  const xpToNextLevel = xpSummary?.xp_to_next_level ?? 100;
  const levelSpan = Math.max(1, nextLevelXp - currentLevelXp);
  const levelBarWidth = xpSummary?.progress_percentage ?? 0;
  const nvoTarget = 85;

  const difficultyColor = (d: string) =>
    d === 'Лесно' ? 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30'
    : d === 'Средно' ? 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30'
    : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30';

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppNavbar showBack={false} />

      <div className="flex flex-1 overflow-hidden">
        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 overflow-y-auto no-scrollbar">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

            {/* A. HERO WELCOME */}
            <section className="rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-violet-600 p-6 text-white shadow-xl shadow-blue-200 dark:shadow-blue-900/40">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-blue-100 text-sm font-medium mb-1">Добре дошъл обратно 👋</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold">{firstName}</h1>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-xl px-3 py-1.5">
                      <span className="text-sm">⭐</span>
                      <span className="text-sm font-semibold">Ниво {level}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-xl px-3 py-1.5">
                      <span className="text-sm">⚡</span>
                      <span className="text-sm font-semibold">+{todayXp} XP днес</span>
                    </div>
                    {isDevMode && (
                      <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-xl px-3 py-1.5 relative">
                        <span className="absolute -top-1 -right-1 inline-flex items-center rounded border border-amber-300 bg-amber-100 px-1 py-0 text-[7px] font-bold text-amber-800 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                          DEV
                        </span>
                        <span className="text-sm">🎯</span>
                        <span className="text-sm font-semibold">НВО готовност: {nvoReadiness}%</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate('/grades')}
                    className="rounded-xl bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-300 px-5 py-2.5 text-sm font-extrabold text-slate-900 shadow-md shadow-amber-900/25 hover:brightness-105 transition-all"
                  >
                    Решавай сега →
                  </button>
                  <button
                    onClick={() => navigate('/nvo/practice')}
                    className="rounded-xl bg-white/20 border border-white/30 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/30 transition-colors"
                  >
                    НВО тренировка
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/15 bg-slate-950/10 px-4 py-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/80">Ниво {level} — XP прогрес</p>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="text-3xl font-black">{xpIntoLevel}</span>
                      <span className="pb-1 text-sm font-medium text-blue-100/85">/ {levelSpan} XP</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">Остават {xpToNextLevel} XP до ниво {level + 1}</p>
                    <p className="text-xs text-blue-100/80">Общо XP: {totalXp}</p>
                  </div>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-amber-300 transition-all duration-1000"
                    style={{ width: `${levelBarWidth}%` }}
                  />
                </div>
              </div>

            </section>

            {/* B. PROGRESS OVERVIEW CARDS */}
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i}>
                    <Bone className="h-3 w-20 mb-3" />
                    <Bone className="h-8 w-14 mb-1" />
                    <Bone className="h-2 w-full rounded-full" />
                  </SkeletonCard>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    onClick={() => navigate('/progress')}
                    className="group rounded-2xl bg-white border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left dark:bg-slate-800/60 dark:border-slate-700"
                  >
                    <div className="text-2xl mb-2">🎓</div>
                    <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                      {stats?.topics_completed ?? 0}
                      <span className="text-base font-normal text-slate-400">/{stats?.total_topics_available ?? 0}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Теми завършени</div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                      <div
                        className="h-1.5 rounded-full bg-blue-500 transition-all duration-700"
                        style={{ width: `${stats?.total_topics_available ? (stats.topics_completed / stats.total_topics_available) * 100 : 0}%` }}
                      />
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/progress')}
                    className="group rounded-2xl bg-white border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-green-200 transition-all text-left dark:bg-slate-800/60 dark:border-slate-700"
                  >
                    <div className="text-2xl mb-2">🎯</div>
                    <div className={`text-2xl font-extrabold ${accuracy >= 80 ? 'text-green-600' : accuracy >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {accuracy.toFixed(0)}%
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Средна точност</div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-700 ${accuracy >= 80 ? 'bg-green-500' : accuracy >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${accuracy}%` }}
                      />
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/grades')}
                    className="group rounded-2xl bg-white border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-violet-200 transition-all text-left dark:bg-slate-800/60 dark:border-slate-700"
                  >
                    <div className="text-2xl mb-2">✅</div>
                    <div className="text-2xl font-extrabold text-violet-600">{stats?.total_exercises_completed ?? 0}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Задачи решени</div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                      <div className="h-1.5 rounded-full bg-violet-400 transition-all duration-700" style={{ width: `${Math.min(100, (stats?.total_exercises_completed ?? 0) * 2)}%` }} />
                    </div>
                  </button>

                  <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700">
                    <div className="text-2xl mb-2">⚠️</div>
                    <div className="text-2xl font-extrabold text-amber-500">{recommendations?.weak_topics?.length ?? 0}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Слаби теми</div>
                    {recommendations?.weak_topics?.slice(0, 2).map(t => (
                      <button
                        key={t.topic_id}
                        onClick={() => navigate(`/topics/${t.topic_id}/lessons`)}
                        className="mt-1 block truncate text-xs text-amber-600 hover:underline dark:text-amber-400"
                      >
                        • {t.title}
                      </button>
                    ))}
                  </div>
                </div>

                <section className="mt-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      onClick={() => navigate('/learn/grades')}
                      className="group rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 px-4 py-3 text-left hover:shadow-md hover:-translate-y-0.5 transition-all dark:border-blue-700/60 dark:from-blue-900/30 dark:to-cyan-900/20"
                    >
                      <div className="text-2xl">📘</div>
                      <div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">Теория</div>
                    </button>
                    <button
                      onClick={() => navigate('/grades')}
                      className="group rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 px-4 py-3 text-left hover:shadow-md hover:-translate-y-0.5 transition-all dark:border-violet-700/60 dark:from-violet-900/30 dark:to-fuchsia-900/20"
                    >
                      <div className="text-2xl">✏️</div>
                      <div className="mt-1 text-sm font-bold text-violet-700 dark:text-violet-300">Практика</div>
                    </button>
                    <button
                      onClick={() => navigate('/progress')}
                      className="group rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-3 text-left hover:shadow-md hover:-translate-y-0.5 transition-all dark:border-slate-700/60 dark:from-slate-900/30 dark:to-slate-800/20"
                    >
                      <div className="text-2xl">📈</div>
                      <div className="mt-1 text-sm font-bold text-[#1c4270] dark:text-slate-300">Прогрес</div>
                    </button>
                    <button
                      onClick={() => navigate('/nvo/practice')}
                      className="group rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 px-4 py-3 text-left hover:shadow-md hover:-translate-y-0.5 transition-all dark:border-rose-700/60 dark:from-rose-900/30 dark:to-orange-900/20"
                    >
                      <div className="text-2xl">📝</div>
                      <div className="mt-1 text-sm font-bold text-rose-700 dark:text-rose-300">НВО</div>
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* D. NVO MODULE — developer only */}
            {isDevMode && <section className="rounded-2xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 p-6 shadow-sm dark:border-rose-800/60 dark:from-rose-950/40 dark:to-orange-950/40">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-rose-800 dark:text-rose-200 flex items-center gap-2">
                  <span>📝</span> НВО Подготовка
                </h2>
                <span className="text-xs font-semibold text-rose-600 bg-rose-100 rounded-full px-2.5 py-1 dark:bg-rose-900/40 dark:text-rose-300">
                  Изпит формат
                </span>
              </div>

              <div className={`grid gap-2 sm:gap-3 mb-5 items-start ${isDevMode ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {/* Developer Only: NVO Readiness meter */}
                {isDevMode && (
                  <div className="text-left pr-1 relative">
                    <span className="absolute -top-1 -left-1 inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-100 px-1 py-0 text-[8px] font-bold text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      ⚠️ DEV
                    </span>
                    <div className="text-3xl font-extrabold text-rose-700 dark:text-rose-300">{nvoReadiness}%</div>
                    <div className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">Готовност</div>
                  </div>
                )}
                <div className={`${isDevMode ? 'text-center' : 'text-left pr-1'}`}>
                  <div className="text-3xl font-extrabold text-orange-600 dark:text-orange-300">85%</div>
                  <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">Цел</div>
                </div>
                <div className={`${isDevMode ? 'text-right pl-1' : 'text-right pl-1'}`}>
                  <div className="text-3xl font-extrabold text-cyan-600 dark:text-cyan-300">{accuracy.toFixed(0)}%</div>
                  <div className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">Среден %</div>
                </div>
              </div>

              <div className="mb-4 relative h-2 w-full rounded-full bg-rose-200 dark:bg-rose-900/50">
                <div
                  className="absolute -top-1.5 h-5 w-0.5 bg-orange-300 dark:bg-orange-200"
                  style={{ left: `${nvoTarget}%` }}
                  aria-hidden="true"
                />
                <span
                  className="absolute -top-7 -translate-x-1/2 text-[10px] font-bold text-orange-600 dark:text-orange-300"
                  style={{ left: `${nvoTarget}%` }}
                >
                  85%
                </span>
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-1000"
                  style={{ width: `${nvoReadiness}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate('/nvo/practice')}
                  className="flex-1 min-w-[120px] rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 transition-colors"
                >
                  Генерирай изпит
                </button>
                <button
                  onClick={() => navigate('/grades')}
                  className="flex-1 min-w-[120px] rounded-xl border-2 border-rose-300 bg-white py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 transition-colors dark:bg-transparent dark:border-rose-700 dark:text-rose-300"
                >
                  Практикувай
                </button>
                <button
                  onClick={() => navigate('/progress')}
                  className="flex-1 min-w-[120px] rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:border-rose-300 transition-colors dark:bg-transparent dark:border-slate-600 dark:text-slate-300"
                >
                  Прегледай грешки
                </button>
              </div>
            </section>}

            {/* F. BADGES */}
            <BadgeShelf />

            {/* E. DAILY MISSIONS */}
            <section>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                <span>⚡</span> Дневни мисии
                <span className="ml-auto text-xs font-normal text-slate-400">Персонализирани за теб</span>
              </h2>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i}>
                      <div className="flex items-start gap-3">
                        <Bone className="h-8 w-8 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Bone className="h-3 w-3/4" />
                          <Bone className="h-2 w-1/2" />
                        </div>
                      </div>
                    </SkeletonCard>
                  ))}
                </div>
              ) : missions.length === 0 ? (
                <p className="text-sm text-slate-400 py-4">Няма активни мисии</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {missions.map(mission => (
                    <div
                      key={mission.id}
                      className="group rounded-2xl bg-white border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all dark:bg-slate-800 dark:border-slate-700"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="text-3xl">{mission.emoji}</span>
                          <div className="flex-1">
                            <h3 className="font-bold text-slate-900 dark:text-slate-50 text-sm mb-0.5">{mission.title}</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-tight">{mission.description}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold rounded-full px-2 py-1 ml-auto ${difficultyColor(mission.difficulty)}`}>
                          {mission.difficulty}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 mb-4 ml-11">
                        <span>⏱ {mission.duration}</span>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-yellow-600 dark:text-yellow-400">+{mission.xp_base}</span>
                            <span className="text-slate-600 dark:text-slate-400">XP</span>
                          </div>
                          <div className="text-slate-400 dark:text-slate-600">·</div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-green-600 dark:text-green-400">+{mission.xp_bonus}</span>
                            <span className="text-slate-600 dark:text-slate-400 text-[10px]">бонус</span>
                          </div>
                        </div>
                      </div>

                      {typeof mission.target_count === 'number' && (
                        <div className="mb-3 ml-11 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          Прогрес: {mission.completed_count ?? 0}/{mission.target_count}
                          {mission.is_completed ? ' • Завършена' : ''}
                        </div>
                      )}

                      <button
                        onClick={() => navigate(mission.route)}
                        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-2.5 text-xs font-bold text-white hover:from-blue-700 hover:to-blue-800 transition-colors shadow-sm"
                      >
                        Започни мисия →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        </main>

      </div>
    </div>
  );
};

export default CoachDashboardPage;
