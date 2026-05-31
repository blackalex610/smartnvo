import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, getRecommendations, type DashboardStats, type ProgressRecommendations } from '../services/progress';
import { useStreak } from '../hooks/useStreak';
import StreakWidget from '../components/StreakWidget';
import AppNavbar from '../components/AppNavbar';
import { useSettings } from '../context/SettingsContext';
import CoachDashboardPage from './CoachDashboardPage';
import { ProgressSkeleton } from '../components/Skeleton';

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
    try { return JSON.parse(localStorage.getItem('user') ?? '{}') as { name?: string; picture?: string; email?: string; isGuest?: boolean }; }
    catch { return {}; }
  }, []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recommendations, setRecommendations] = useState<ProgressRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    // Skip API calls for guest users - they don't have a token
    if (user.isGuest) {
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
      setRecommendations({
        weak_topics: [],
        recommended_lessons: [],
        encouragement_message: 'Влез в профил, за да видиш препоръките си.',
      });
      setLoading(false);
      return;
    }

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
  }, [user.isGuest]);

  const accuracy = stats?.accuracy_percentage ?? 0;

  const quickLinks = [
    { short: 'NVO', label: 'NVO', action: () => navigate('/nvo/practice'), tone: 'bg-[#1c4270] hover:bg-slate-700' },
    { short: 'EX', label: 'Exercises', action: () => navigate('/grades'), tone: 'bg-slate-600 hover:bg-[#1c4270]' },
    { short: 'TH', label: 'Theory', action: () => navigate('/learn/grades'), tone: 'bg-slate-600 hover:bg-[#1c4270]' },
    { short: 'PR', label: 'Progress', action: () => navigate('/progress'), tone: 'bg-slate-600 hover:bg-[#1c4270]' },
    { short: 'ST', label: 'Stats', action: () => scrollToSection('dashboard-stats'), tone: 'bg-slate-600 hover:bg-[#1c4270]' },
    { short: 'FA', label: 'Focus Areas', action: () => scrollToSection('dashboard-weak-topics'), tone: 'bg-slate-600 hover:bg-[#1c4270]' },
    { short: 'AC', label: 'Actions', action: () => scrollToSection('dashboard-actions'), tone: 'bg-slate-600 hover:bg-[#1c4270]' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNavbar showBack={false} />

      <div className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 md:block">
        <div className="dashboard-jump-shell group relative w-[4.25rem]">
          <div className="dashboard-jump-rail absolute right-0 top-0 max-h-[72vh] w-[17rem] overflow-y-auto no-scrollbar rounded-l-xl border border-slate-200 bg-white p-3 shadow-md">
            <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1c4270]">Jump</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 group-hover:hidden">Mini</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 group-hover:inline">Expanded</span>
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
          <h2 className="text-2xl font-bold text-[#1c4270] tracking-tight">Добре дошъл{user.name ? `, ${user.name.split(' ')[0]}` : ''}.</h2>
          <p className="mt-1.5 text-base text-slate-500">
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
          <ProgressSkeleton />
        ) : (
          <>
            {/* Stat cards — all clickable */}
            <div id="dashboard-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 scroll-mt-28">
              <button
                onClick={() => navigate('/grades')}
                className="group bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[#1c4270] bg-slate-100 px-2 py-1 rounded-md">
                    Упражнения
                  </span>
                </div>
                <p className="text-3xl font-bold text-[#1c4270]">{stats?.total_exercises_completed ?? 0}</p>
                <p className="text-sm text-slate-400 mt-1">решени задачи</p>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="group bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[#1c4270] bg-slate-100 px-2 py-1 rounded-md">
                    Точност
                  </span>
                </div>
                <p className="text-3xl font-bold text-[#1c4270]">{accuracy.toFixed(0)}%</p>
                <p className="text-sm text-slate-400 mt-1">средна точност</p>
              </button>

              <button
                onClick={() => navigate('/grades')}
                className="group bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[#1c4270] bg-slate-100 px-2 py-1 rounded-md">
                    Теми
                  </span>
                </div>
                <p className="text-3xl font-bold text-[#1c4270]">{stats?.topics_started ?? 0}</p>
                <p className="text-sm text-slate-400 mt-1">започнати теми</p>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="group bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[#1c4270] bg-slate-100 px-2 py-1 rounded-md">
                    Уроци
                  </span>
                </div>
                <p className="text-3xl font-bold text-[#1c4270]">
                  {stats?.lessons_completed ?? 0}
                  <span className="text-xl text-slate-300">/{stats?.total_lessons_available ?? 0}</span>
                </p>
                <p className="text-sm text-slate-400 mt-1">завършени уроци</p>
              </button>
            </div>

            {/* Weak topics */}
            {recommendations && recommendations.weak_topics.length > 0 && (
              <div id="dashboard-weak-topics" className="mb-10 bg-white border border-slate-200 rounded-xl p-6 scroll-mt-28">
                <h3 className="text-sm font-bold text-[#1c4270] mb-4 uppercase tracking-widest">
                  Теми за упражняване
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommendations.weak_topics.map((topic) => (
                    <button
                      key={topic.topic_id}
                      onClick={() => navigate('/grades')}
                      className="bg-slate-50 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-left"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-[#1c4270] truncate">{topic.title}</h4>
                          <p className="text-sm text-slate-500 mt-0.5">{topic.reason}</p>
                        </div>
                        <span className="ml-3 text-lg font-bold text-[#1c4270] shrink-0">
                          {topic.accuracy.toFixed(0)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action cards */}
            <h3 id="dashboard-actions" className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4 scroll-mt-28">
              Какво искаш да правиш?
            </h3>
            <div className="space-y-5">
              <button
                onClick={() => navigate('/nvo/practice')}
                className="group relative bg-[#1c4270] text-white rounded-xl p-6 shadow-md hover:bg-slate-700 hover:shadow-lg transition-all text-left overflow-hidden w-full"
              >
                <div className="relative">
                  <div className="inline-block text-xs font-bold uppercase tracking-widest bg-white/15 px-2 py-1 rounded-md mb-3 text-white/70">
                    Основен модул
                  </div>
                  <h3 className="text-xl font-bold mb-1">НВО</h3>
                  <p className="text-white/60 text-sm">
                    Национално външно оценяване: тренировки в изпитен формат
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
                    Стартирай НВО тренировка
                    <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </div>
                </div>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

              <button
                onClick={() => navigate('/grades')}
                className="group relative bg-slate-600 text-white rounded-xl p-6 shadow-sm hover:bg-[#1c4270] hover:shadow-md transition-all text-left overflow-hidden"
              >
                <div className="relative">
                  <h3 className="text-base font-bold mb-1">Упражнения</h3>
                  <p className="text-white/60 text-sm">Практикувай с AI-генерирани задачи</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/70 group-hover:text-white transition-colors">
                    Започни
                    <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/learn/grades')}
                className="group relative bg-slate-600 text-white rounded-xl p-6 shadow-sm hover:bg-[#1c4270] hover:shadow-md transition-all text-left overflow-hidden"
              >
                <div className="relative">
                  <h3 className="text-base font-bold mb-1">Теория</h3>
                  <p className="text-white/60 text-sm">Учи концепциите стъпка по стъпка</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/70 group-hover:text-white transition-colors">
                    Отвори
                    <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="group relative bg-slate-600 text-white rounded-xl p-6 shadow-sm hover:bg-[#1c4270] hover:shadow-md transition-all text-left overflow-hidden"
              >
                <div className="relative">
                  <h3 className="text-base font-bold mb-1">Прогрес</h3>
                  <p className="text-white/60 text-sm">Виж детайлен напредък по теми</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/70 group-hover:text-white transition-colors">
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
