import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDashboardStats,
  getRecommendations,
  getTopicProgress,
  type DashboardStats,
  type ProgressRecommendations,
  type TopicProgress,
} from '../services/progress';
import ProgressBar from '../components/ProgressBar';
import AppNavbar from '../components/AppNavbar';
import ActivityFeed from '../components/ActivityFeed';
import BadgeShelf from '../components/BadgeShelf';

const DEMO_STATS: DashboardStats = {
  total_exercises_completed: 148,
  total_exercises_attempted: 196,
  accuracy_percentage: 75.5,
  topics_started: 10,
  topics_completed: 6,
  total_topics_available: 12,
  lessons_started: 29,
  lessons_completed: 21,
  total_lessons_available: 36,
  recent_activity: [],
};

const DEMO_RECOMMENDATIONS: ProgressRecommendations = {
  weak_topics: [
    { topic_id: 101, title: 'Рационални изрази', accuracy: 58.0, reason: 'Accuracy is 58.0% (target: 60%+)' },
    { topic_id: 102, title: 'Геометрични доказателства', accuracy: 54.0, reason: 'Accuracy is 54.0% (target: 60%+)' },
  ],
  recommended_lessons: [
    {
      lesson_id: 701,
      topic_id: 101,
      lesson_title: 'Опростяване на рационални изрази',
      topic_title: 'Рационални изрази',
      reason: 'Practice needed to improve accuracy',
    },
    {
      lesson_id: 702,
      topic_id: 102,
      lesson_title: 'Доказване на еднаквост на триъгълници',
      topic_title: 'Геометрични доказателства',
      reason: 'Practice needed to improve accuracy',
    },
  ],
  encouragement_message: 'Стабилен напредък. Няколко целенасочени упражнения ще повишат точността над 80%.',
};

const DEMO_TOPICS: TopicProgress[] = [
  {
    topic_id: 1,
    title: 'Алгебраични изрази',
    description: 'Преобразуване и пресмятане',
    grade_number: 5,
    progress_percentage: 82,
    accuracy: 84,
    completed_exercises: 41,
    total_exercises: 50,
    lessons_completed: 6,
    total_lessons: 7,
    needs_practice: false,
  },
  {
    topic_id: 2,
    title: 'Линейни уравнения',
    description: 'Уравнения с една променлива',
    grade_number: 6,
    progress_percentage: 76,
    accuracy: 72,
    completed_exercises: 38,
    total_exercises: 50,
    lessons_completed: 5,
    total_lessons: 7,
    needs_practice: false,
  },
  {
    topic_id: 3,
    title: 'Питагорова теорема',
    description: 'Задачи с правоъгълни триъгълници',
    grade_number: 7,
    progress_percentage: 64,
    accuracy: 58,
    completed_exercises: 32,
    total_exercises: 50,
    lessons_completed: 4,
    total_lessons: 7,
    needs_practice: true,
  },
  {
    topic_id: 4,
    title: 'Координатна система',
    description: 'Точки, разстояния и графики',
    grade_number: 7,
    progress_percentage: 70,
    accuracy: 69,
    completed_exercises: 35,
    total_exercises: 50,
    lessons_completed: 6,
    total_lessons: 8,
    needs_practice: false,
  },
];

const ProgressSummaryPage: React.FC = () => {
  const navigate = useNavigate();
  const isDeveloperMode = import.meta.env.DEV || localStorage.getItem('devMode') === 'true';
  const [demoMode, setDemoMode] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recommendations, setRecommendations] = useState<ProgressRecommendations | null>(null);
  const [topics, setTopics] = useState<TopicProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demoMode) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsData, recommendationsData, topicData] = await Promise.all([
          getDashboardStats(),
          getRecommendations(),
          getTopicProgress(),
        ]);

        setStats(statsData);
        setRecommendations(recommendationsData);
        setTopics(topicData);
      } catch (err) {
        console.error('Error fetching progress summary:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [demoMode]);

  const effectiveStats = demoMode ? DEMO_STATS : stats;
  const effectiveRecommendations = demoMode ? DEMO_RECOMMENDATIONS : recommendations;
  const effectiveTopics = demoMode ? DEMO_TOPICS : topics;

  const gradeSummary = useMemo(() => {
    const byGrade = new Map<number, { completed: number; total: number; accuracySum: number; count: number }>();

    effectiveTopics.forEach((topic) => {
      const current = byGrade.get(topic.grade_number) ?? {
        completed: 0,
        total: 0,
        accuracySum: 0,
        count: 0,
      };

      current.completed += topic.completed_exercises;
      current.total += topic.total_exercises;
      current.accuracySum += topic.accuracy;
      current.count += 1;
      byGrade.set(topic.grade_number, current);
    });

    return Array.from(byGrade.entries())
      .map(([gradeNumber, values]) => ({
        gradeNumber,
        progress: values.total > 0 ? (values.completed / values.total) * 100 : 0,
        accuracy: values.count > 0 ? values.accuracySum / values.count : 0,
      }))
      .sort((a, b) => a.gradeNumber - b.gradeNumber);
  }, [effectiveTopics]);

  const accuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return 'text-green-600 dark:text-green-400';
    if (accuracy >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12 text-gray-600 dark:text-slate-400">Зареждане...</div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-black text-gray-900 dark:text-slate-100">Твоят прогрес</h1>
              <p className="mt-2 text-gray-500 dark:text-slate-400">
                Следи напредъка си, намери слабите места и се върни директно към темите за практика.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <button
                onClick={() => navigate('/grades')}
                className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md transition-all text-left"
              >
                <p className="text-sm text-gray-600 dark:text-slate-400">Решени задачи</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{effectiveStats?.total_exercises_completed || 0}</p>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-500 hover:shadow-md transition-all text-left"
              >
                <p className="text-sm text-gray-600 dark:text-slate-400">Общо опити</p>
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{effectiveStats?.total_exercises_attempted || 0}</p>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500 hover:shadow-md transition-all text-left"
              >
                <p className="text-sm text-gray-600 dark:text-slate-400">Точност</p>
                <p className={`text-3xl font-bold ${accuracyColor(effectiveStats?.accuracy_percentage || 0)}`}>
                  {effectiveStats?.accuracy_percentage.toFixed(0) || 0}%
                </p>
              </button>

              <button
                onClick={() => navigate('/progress')}
                className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-500 hover:shadow-md transition-all text-left"
              >
                <p className="text-sm text-gray-600 dark:text-slate-400">Завършени уроци</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                  {effectiveStats?.lessons_completed || 0}/{effectiveStats?.total_lessons_available || 0}
                </p>
              </button>
            </div>

            {isDeveloperMode && (
              <div className="mb-6 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-700/50 dark:bg-violet-900/20 px-4 py-3">
                <p className="text-sm text-violet-900 dark:text-violet-300 font-medium">
                  {demoMode ? 'Режим за screenshot: активен (демо данни)' : 'Реални данни от API'}
                </p>
                <button
                  onClick={() => setDemoMode((prev) => !prev)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-violet-300 dark:border-violet-600 bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                >
                  {demoMode ? 'Покажи реални данни' : 'Включи демо данни'}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-4">Препоръчани уроци</h2>
                {effectiveRecommendations && effectiveRecommendations.recommended_lessons.length > 0 ? (
                  <div className="space-y-3">
                    {effectiveRecommendations.recommended_lessons.map((lesson) => (
                      <button
                        key={lesson.lesson_id}
                        onClick={() => navigate(`/lessons/${lesson.lesson_id}/exercises`)}
                        className="w-full border border-blue-200 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-left hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-slate-100">{lesson.lesson_title}</p>
                            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{lesson.topic_title}</p>
                          </div>
                          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Отвори →</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">{lesson.reason}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 dark:text-slate-400">Няма препоръчани уроци в момента. Продължавай така!</p>
                )}
              </div>

              <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-4">Преглед по клас</h2>
                {gradeSummary.length > 0 ? (
                  <div className="space-y-4">
                    {gradeSummary.map((grade) => (
                      <div
                        key={grade.gradeNumber}
                        className="w-full text-left rounded-xl border border-gray-200 dark:border-slate-700 p-4"
                      >
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700 dark:text-slate-200">{grade.gradeNumber} клас</span>
                          <span className="text-gray-600 dark:text-slate-400">Точност: {grade.accuracy.toFixed(0)}%</span>
                        </div>
                        <ProgressBar percentage={grade.progress} color="blue" height="md" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 dark:text-slate-400">Все още няма данни за класове.</p>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 mb-8">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-2">Какво следва</h2>
              <p className="text-gray-600 dark:text-slate-400 mb-4">
                {effectiveRecommendations?.encouragement_message || 'Практикувай редовно, за да поддържаш добър напредък.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/grades')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Към упражненията
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 px-4 py-2 rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Към таблото
                </button>
              </div>
            </div>

            {/* Badges */}
            <BadgeShelf />

            {/* XP Activity Feed */}
            <div className="mt-6">
              <ActivityFeed />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ProgressSummaryPage;