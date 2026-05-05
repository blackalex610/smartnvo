import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, getRecommendations, type DashboardStats, type ProgressRecommendations } from '../services/progress';
import { useStreak } from '../hooks/useStreak';
import StreakWidget from '../components/StreakWidget';
import AppNavbar from '../components/AppNavbar';
import { useSettings } from '../context/SettingsContext';
import CoachDashboardPage from './CoachDashboardPage';

const ClassicDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const streak = useStreak();
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}') as { name?: string; picture?: string; email?: string }; }
    catch { return {}; }
  }, []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recommendations, setRecommendations] = useState<ProgressRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [statsResult, recommendationsResult] = await Promise.allSettled([
          getDashboardStats(),
          getRecommendations()
        ]);

        if (statsResult.status === 'fulfilled') {
          setStats(statsResult.value);
        } else {
          console.error('Dashboard stats request failed:', statsResult.reason);
          setStats({
            total_exercises_completed: 0,
            total_exercises_attempted: 0,
            accuracy_percentage: 0,
            topics_started: 0,
            topics_completed: 0,
            total_topics_available: 0,
            lessons_started: 0,
            lessons_completed: 0,
            total_lessons_available: 0,
            recent_activity: [],
          });
        }

        if (recommendationsResult.status === 'fulfilled') {
          setRecommendations(recommendationsResult.value);
        } else {
          console.error('Recommendations request failed:', recommendationsResult.reason);
          setRecommendations({
            weak_topics: [],
            recommended_lessons: [],
            encouragement_message: 'Данните за препоръки са временно недостъпни.',
          });
        }

        if (statsResult.status === 'rejected' && recommendationsResult.status === 'rejected') {
          setLoadError('Неуспешно зареждане на таблото. Провери дали backend сървърът работи.');
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setLoadError('Възникна проблем при зареждане на данните.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const accuracy = stats?.accuracy_percentage ?? 0;
  const accuracyColor =
    accuracy >= 80 ? 'text-green-600' : accuracy >= 50 ? 'text-yellow-500' : 'text-red-500';

  const quickLinks = [
    { short: 'NVO', label: 'NVO', action: () => navigate('/nvo/practice'), tone: 'bg-rose-500 hover:bg-rose-600' },
    { short: 'EX', label: 'Exercises', action: () => navigate('/grades'), tone: 'bg-blue-600 hover:bg-blue-700' },
    { short: 'TH', label: 'Theory', action: () => navigate('/learn/grades'), tone: 'bg-violet-600 hover:bg-violet-700' },
    { short: 'PR', label: 'Progress', action: () => navigate('/progress'), tone: 'bg-emerald-600 hover:bg-emerald-700' },
    { short: 'ST', label: 'Stats', action: () => scrollToSection('dashboard-stats'), tone: 'bg-slate-600 hover:bg-slate-700' },
    { short: 'FA', label: 'Focus Areas', action: () => scrollToSection('dashboard-weak-topics'), tone: 'bg-slate-600 hover:bg-slate-700' },
    { short: 'AC', label: 'Actions', action: () => scrollToSection('dashboard-actions'), tone: 'bg-slate-600 hover:bg-slate-700' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <AppNavbar showBack={false} />

      <div className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 md:block">
        <div className="dashboard-jump-shell group relative w-[4.25rem]">
          <div className="dashboard-jump-rail absolute right-0 top-0 max-h-[72vh] w-[17rem] overflow-y-auto no-scrollbar rounded-l-2xl border border-slate-200/80 bg-white/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-700 dark:bg-slate-950/90">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/70">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">Jump</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 group-hover:hidden">Mini</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 group-hover:inline">Expanded</span>
            </div>

            <div className="space-y-2">
              {quickLinks.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-white transition-colors ${item.tone}`}
                >
                  <span className="inline-block min-w-[2.25rem] rounded-md bg-white/20 px-1.5 py-0.5 text-center text-[11px] font-extrabold tracking-wide">
                    {item.short}
                  </span>
                  <span className="ml-2 hidden flex-1 text-right group-hover:inline">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Greeting */}
        <div className="mb-6">
          <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">Добре дошъл{user.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋</h2>
          <p className="mt-2 text-lg text-gray-500">
            {recommendations?.encouragement_message || 'Готов ли си да учиш математика днес?'}
          </p>
        </div>

        <StreakWidget
          streak={streak}
          exercisesToday={stats?.total_exercises_completed ?? 0}
          lessonsToday={stats?.lessons_started ?? 0}
        />

        {loadError && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm">Зареждане...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Stat cards — all clickable */}
            <div id="dashboard-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 scroll-mt-28">
              <button
                onClick={() => navigate('/grades')}
                className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">✅</span>
                  <span className="text-xs font-semibold text-blue-500 bg-blue-50 px-2 py-1 rounded-full group-hover:bg-blue-100 transition-colors">
                    Упражнения
                  </span>
                </div>
                <p className="text-4xl font-extrabold text-blue-600">{stats?.total_exercises_completed ?? 0}</p>
                <p className="text-sm text-gray-400 mt-1">решени задачи</p>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-green-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">🎯</span>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full group-hover:bg-green-100 transition-colors">
                    Точност
                  </span>
                </div>
                <p className={`text-4xl font-extrabold ${accuracyColor}`}>{accuracy.toFixed(0)}%</p>
                <p className="text-sm text-gray-400 mt-1">средна точност</p>
              </button>

              <button
                onClick={() => navigate('/grades')}
                className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-purple-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">📚</span>
                  <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded-full group-hover:bg-purple-100 transition-colors">
                    Теми
                  </span>
                </div>
                <p className="text-4xl font-extrabold text-purple-600">{stats?.topics_started ?? 0}</p>
                <p className="text-sm text-gray-400 mt-1">започнати теми</p>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">📖</span>
                  <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-full group-hover:bg-orange-100 transition-colors">
                    Уроци
                  </span>
                </div>
                <p className="text-4xl font-extrabold text-orange-500">
                  {stats?.lessons_completed ?? 0}
                  <span className="text-2xl text-gray-300">/{stats?.total_lessons_available ?? 0}</span>
                </p>
                <p className="text-sm text-gray-400 mt-1">завършени уроци</p>
              </button>
            </div>

            {/* Weak topics */}
            {recommendations && recommendations.weak_topics.length > 0 && (
              <div id="dashboard-weak-topics" className="mb-10 bg-amber-50 border border-amber-200 rounded-2xl p-6 dark:bg-amber-950/35 dark:border-amber-700/55 scroll-mt-28">
                <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2 dark:text-amber-100">
                  ⚠️ Теми за практикуване
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommendations.weak_topics.map((topic) => (
                    <button
                      key={topic.topic_id}
                      onClick={() => navigate('/grades')}
                      className="bg-white p-4 rounded-xl border border-amber-200 hover:border-amber-400 hover:shadow-sm transition-all text-left dark:bg-slate-900/75 dark:border-amber-700/45 dark:hover:border-amber-500"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-800 truncate dark:text-amber-50">{topic.title}</h4>
                          <p className="text-sm text-gray-500 mt-0.5 dark:text-amber-200/80">{topic.reason}</p>
                        </div>
                        <span className="ml-3 text-xl font-extrabold text-amber-500 shrink-0 dark:text-amber-300">
                          {topic.accuracy.toFixed(0)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action cards */}
            <h3 id="dashboard-actions" className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 scroll-mt-28">
              Какво искаш да правиш?
            </h3>
            <div className="space-y-5">
              <button
                onClick={() => navigate('/nvo/practice')}
                className="group relative bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 text-white rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all text-left overflow-hidden ring-2 ring-orange-200 w-full"
              >
                <div className="absolute -top-2 -right-2 text-8xl opacity-15 select-none pointer-events-none">📝</div>
                <div className="relative">
                  <div className="inline-block text-xs font-bold uppercase tracking-widest bg-white/20 px-2 py-1 rounded-full mb-3">
                    Основен модул
                  </div>
                  <div className="text-3xl mb-2">📝</div>
                  <h3 className="text-xl font-extrabold mb-1">НВО</h3>
                  <p className="text-orange-100 text-sm font-medium">
                    Национално външно оценяване: тренировки в изпитен формат
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
                    Стартирай НВО тренировка
                    <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </div>
                </div>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

              <button
                onClick={() => navigate('/grades')}
                className="group relative bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl p-6 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all text-left overflow-hidden"
              >
                <div className="absolute -top-2 -right-2 text-7xl opacity-10 select-none pointer-events-none">✏️</div>
                <div className="relative">
                  <div className="text-3xl mb-3">✏️</div>
                  <h3 className="text-lg font-bold mb-1">Упражнения</h3>
                  <p className="text-blue-100 text-sm">Практикувай с AI-генерирани задачи</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
                    Започни
                    <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/learn/grades')}
                className="group relative bg-gradient-to-br from-violet-500 to-violet-700 text-white rounded-2xl p-6 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all text-left overflow-hidden"
              >
                <div className="absolute -top-2 -right-2 text-7xl opacity-10 select-none pointer-events-none">📖</div>
                <div className="relative">
                  <div className="text-3xl mb-3">📖</div>
                  <h3 className="text-lg font-bold mb-1">Теория</h3>
                  <p className="text-violet-100 text-sm">Учи концепциите стъпка по стъпка</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
                    Отвори
                    <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="group relative bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-2xl p-6 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all text-left overflow-hidden"
              >
                <div className="absolute -top-2 -right-2 text-7xl opacity-10 select-none pointer-events-none">📊</div>
                <div className="relative">
                  <div className="text-3xl mb-3">📊</div>
                  <h3 className="text-lg font-bold mb-1">Прогрес</h3>
                  <p className="text-emerald-100 text-sm">Виж детайлен напредък по теми</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
                    Преглед
                    <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </div>
                </div>
              </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const DashboardPage: React.FC = () => {
  const { dashboardLayout } = useSettings();
  if (dashboardLayout === 'coach') return <CoachDashboardPage />;
  return <ClassicDashboardPage />;
};

export default DashboardPage;
