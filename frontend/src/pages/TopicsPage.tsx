import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTopics, type Topic } from '../services/curriculum';
import { getTopicProgress, type TopicProgress } from '../services/progress';
import ProgressBar from '../components/ProgressBar';
import AppNavbar from '../components/AppNavbar';

const TopicsPage: React.FC = () => {
  const navigate = useNavigate();
  const { gradeId } = useParams<{ gradeId: string }>();
  const displayGradeLabel = (() => {
    if (!gradeId) return '';
    const parsed = Number(gradeId);
    if (Number.isNaN(parsed)) return gradeId;
    return parsed >= 1 && parsed <= 3 ? String(parsed + 4) : String(parsed);
  })();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [progressData, setProgressData] = useState<Map<number, TopicProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CATEGORY_STYLES: Record<string, { bg: string; border: string; icon: string; text: string; badge: string }> = {
    'Числа и операции': { bg: 'bg-blue-50', border: 'border-blue-400', icon: '🔢', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/55 dark:text-blue-100 dark:border dark:border-blue-500/50' },
    'Алгебра': { bg: 'bg-purple-50', border: 'border-purple-400', icon: '📐', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/55 dark:text-purple-100 dark:border dark:border-purple-500/50' },
    'Геометрия': { bg: 'bg-green-50', border: 'border-green-400', icon: '📏', text: 'text-green-700', badge: 'bg-green-100 text-green-700 dark:bg-green-900/55 dark:text-green-100 dark:border dark:border-green-500/50' },
    'Данни и вероятности': { bg: 'bg-orange-50', border: 'border-orange-400', icon: '📊', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/55 dark:text-orange-100 dark:border dark:border-orange-500/50' },
  };
  const DEFAULT_STYLE = { bg: 'bg-gray-50', border: 'border-gray-400', icon: '📖', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-100 dark:border dark:border-slate-600/70' };

  useEffect(() => {
    const fetchData = async () => {
      if (!gradeId) return;

      try {
        setLoading(true);
        const [topicsData, progressList] = await Promise.all([
          getTopics(parseInt(gradeId)),
          getTopicProgress()
        ]);
        
        setTopics(topicsData);
        
        // Create a map of topic progress by topic_id
        const progressMap = new Map<number, TopicProgress>();
        progressList.forEach(p => progressMap.set(p.topic_id, p));
        setProgressData(progressMap);
      } catch (err) {
        setError('Грешка при зареждане на темите');
        console.error('Error fetching topics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [gradeId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Зареждане...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-transparent">
      <AppNavbar backTo="/grades" backLabel="Назад към класове" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-slate-100">{displayGradeLabel}. клас</h2>
          <p className="mt-2 text-gray-500 dark:text-slate-300">Избери категория, за да започнеш упражненията</p>
        </div>

        {topics.length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow text-center text-gray-500">
            Няма налични категории за този клас
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {topics.map((topic) => {
              const progress = progressData.get(topic.id);
              const hasProgress = progress && progress.completed_exercises > 0;
              const style = CATEGORY_STYLES[topic.title] ?? DEFAULT_STYLE;
              
              return (
                <button
                  key={topic.id}
                  onClick={() => navigate(`/topics/${topic.id}/lessons`)}
                  className={`${style.bg} border-2 ${style.border} rounded-2xl p-6 text-left group motion-card motion-fade-up`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-4xl motion-icon">{style.icon}</span>
                      <h3 className={`text-xl font-bold ${style.text}`}>{topic.title}</h3>
                    </div>
                    {progress?.needs_practice && (
                      <span className="text-yellow-500 text-xl" title="Нуждае се от практика">⚠️</span>
                    )}
                  </div>
                  
                  {topic.description && (
                    <p className="text-gray-600 text-sm mb-4">{topic.description}</p>
                  )}
                  
                  {hasProgress && progress ? (
                    <div className="space-y-3 mb-4">
                      <div>
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>Прогрес</span>
                          <span>{progress.completed_exercises}/{progress.total_exercises} упражнения</span>
                        </div>
                        <ProgressBar 
                          percentage={progress.progress_percentage} 
                          color="blue"
                          showLabel={false}
                          height="sm"
                        />
                      </div>
                      
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Точност:</span>
                        <span className={
                          progress.accuracy >= 80 ? 'text-green-600 font-semibold' :
                          progress.accuracy >= 60 ? 'text-yellow-600 font-semibold' :
                          'text-red-600 font-semibold'
                        }>
                          {progress.accuracy.toFixed(0)}%
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Уроци:</span>
                        <span className="text-gray-700">
                          {progress.lessons_completed}/{progress.total_lessons} завършени
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 text-sm text-gray-500">
                      Не е започнато
                    </div>
                  )}
                  
                  <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${style.badge}`}>
                    Виж уроците →
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default TopicsPage;
