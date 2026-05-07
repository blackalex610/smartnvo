import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLessons, getTopic, type Lesson, type Topic } from '../services/curriculum';
import { getLessonProgress, type LessonProgress } from '../services/progress';
import { trackEvent } from '../services/analytics';
import ProgressBar from '../components/ProgressBar';
import AppNavbar from '../components/AppNavbar';

const LearnLessonsPage: React.FC = () => {
  const navigate = useNavigate();
  const { topicId } = useParams<{ topicId: string }>();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [progressData, setProgressData] = useState<Map<number, LessonProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchLessons = async () => {
      if (!topicId) return;

      try {
        setLoading(true);
        const [lessonsData, topicData, progressList] = await Promise.all([
          getLessons(parseInt(topicId)),
          getTopic(parseInt(topicId)),
          getLessonProgress(parseInt(topicId)),
        ]);
        setLessons(lessonsData);
        setTopic(topicData);
        const progressMap = new Map<number, LessonProgress>();
        progressList.forEach((p) => progressMap.set(p.lesson_id, p));
        setProgressData(progressMap);
      } catch (err) {
        setError('Грешка при зареждане на уроците');
        console.error('Error fetching lessons:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLessons();
  }, [topicId]);

  const filteredLessons = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return lessons;
    return lessons.filter((lesson) => lesson.title.toLowerCase().includes(query));
  }, [lessons, searchTerm]);

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
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">Категория</p>
          <h2 className="text-3xl font-bold text-gray-900">{topic?.title ?? 'Уроци'}</h2>
          {topic?.description && (
            <p className="mt-2 text-gray-500">{topic.description}</p>
          )}
          <p className="mt-1 text-sm text-gray-400">
            {filteredLessons.length} от {lessons.length} урока
          </p>
        </div>

        {lessons.length > 0 && (
          <div className="max-w-3xl mb-5">
            <label htmlFor="lessons-search" className="sr-only">Търси урок</label>
            <input
              id="lessons-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Търси урок..."
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
        )}

        {lessons.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <p className="text-gray-600">Няма налични уроци за тази тема</p>
          </div>
        ) : filteredLessons.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-3xl">
            <p className="text-gray-600">Няма уроци, които съвпадат с "{searchTerm}"</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {filteredLessons.map((lesson) => {
              const lessonNumber = lessons.findIndex((l) => l.id === lesson.id) + 1;
              const progress = progressData.get(lesson.id);
              const hasProgress = progress && progress.completed_exercises > 0;
              return (
                <button
                  key={lesson.id}
                  onClick={() => {
                    trackEvent('lesson_started', {
                      lesson_id: lesson.id,
                      lesson_title: lesson.title,
                      topic_id: topicId ? parseInt(topicId, 10) : null,
                    });
                    navigate(`/learn/lessons/${lesson.id}/theory`);
                  }}
                  className="w-full bg-white p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative flex-shrink-0 w-9 h-9">
                      <div className="w-9 h-9 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-600 transition-colors">
                        {lessonNumber}
                      </div>
                      {progress?.completed && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-[9px] font-bold">✓</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-800 font-medium">{lesson.title}</span>
                        {progress?.completed && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded">
                            Завършен
                          </span>
                        )}
                        {hasProgress && !progress?.completed && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                            В процес
                          </span>
                        )}
                      </div>
                      {hasProgress && progress ? (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Упражнения</span>
                            <span>{progress.completed_exercises}/{progress.total_exercises}</span>
                          </div>
                          <ProgressBar
                            percentage={progress.progress_percentage}
                            color={progress.completed ? 'green' : 'blue'}
                            showLabel={false}
                            height="sm"
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">Не е започнат</p>
                      )}
                    </div>
                    <span className="text-blue-500 text-sm font-medium whitespace-nowrap group-hover:text-blue-700 flex-shrink-0">
                      Отвори →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default LearnLessonsPage;