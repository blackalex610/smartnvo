import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGrades, type Grade } from '../services/curriculum';
import AppNavbar from '../components/AppNavbar';
import { TopicsSkeleton } from '../components/Skeleton';

const GRADE_META: Record<number, { subtitle: string; highlights: string[]; accent: string }> = {
  5: {
    subtitle: 'Стабилна основа в числа, геометрия и първи алгебрични идеи',
    highlights: ['Натурални числа и дроби', 'Периметър и лице', 'Таблици и диаграми'],
    accent: 'from-blue-500 to-cyan-500',
  },
  6: {
    subtitle: 'Преход към по-сложни операции, уравнения и обем',
    highlights: ['Цели числа и проценти', 'Линейни уравнения', 'Обем на тела'],
    accent: 'from-slate-500 to-[#1c4270]',
  },
  7: {
    subtitle: 'Подготовка за по-високо ниво с алгебра и приложна геометрия',
    highlights: ['Рационални числа', 'Системи уравнения', 'Координатна геометрия'],
    accent: 'from-orange-500 to-amber-500',
  },
};

const LearnGradesPage: React.FC = () => {
  const navigate = useNavigate();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGrades = async () => {
      try {
        setLoading(true);
        const data = await getGrades();
        setGrades(data);
      } catch (err) {
        setError('Грешка при зареждане на класовете');
        console.error('Error fetching grades:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGrades();
  }, []);

  if (loading) return <TopicsSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-transparent flex items-center justify-center">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-transparent relative overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-cyan-100/60 dark:bg-cyan-500/12 rounded-full blur-3xl" />
        <div className="absolute top-32 right-0 w-96 h-96 bg-amber-100/60 dark:bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        <section className="mb-10 bg-white border border-slate-200 dark:bg-slate-950/60 dark:border-indigo-400/30 rounded-3xl p-6 md:p-10 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 dark:text-slate-300 mb-3">
            Учебна карта
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-slate-100 leading-tight">
            Избери клас и влез в
            <span className="bg-gradient-to-r from-cyan-500 to-blue-600 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent"> правилната програма</span>
          </h2>
          <p className="mt-4 text-slate-600 dark:text-slate-300 max-w-3xl text-base md:text-lg">
            Всеки клас е организиран в категории: Числа и операции, Алгебра, Геометрия, Данни и вероятности.
            Натисни карта, за да видиш всички уроци по категории.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <div className="rounded-xl bg-slate-100 dark:bg-slate-900/85 border border-transparent dark:border-indigo-400/30 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-300">Класове</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">3</p>
            </div>
            <div className="rounded-xl bg-slate-100 dark:bg-slate-900/85 border border-transparent dark:border-indigo-400/30 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-300">Категории</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">12</p>
            </div>
            <div className="rounded-xl bg-slate-100 dark:bg-slate-900/85 border border-transparent dark:border-indigo-400/30 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-300">Уроци</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">63</p>
            </div>
            <div className="rounded-xl bg-slate-100 dark:bg-slate-900/85 border border-transparent dark:border-indigo-400/30 px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-slate-300">Език</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">BG</p>
            </div>
          </div>
        </section>

        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">Избери клас</h3>
          <span className="text-sm text-slate-500 dark:text-slate-300">Клас → категория → урок</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {grades.map((grade) => (
            <button
              key={grade.id}
              onClick={() => navigate(`/learn/grades/${grade.id}/topics`)}
              className="group bg-white dark:bg-slate-950/60 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-indigo-400/30 hover:shadow-xl hover:-translate-y-1 transition-all text-left"
            >
              <div className={`h-2 w-full rounded-full bg-gradient-to-r ${GRADE_META[grade.grade_number]?.accent ?? 'from-slate-400 to-slate-500'} mb-5`} />
              <div className="flex items-end justify-between mb-3">
                <div className="text-3xl font-black text-slate-900 dark:text-slate-50 leading-none">
                  {grade.grade_number} клас
                </div>
                <div className="text-sm font-semibold text-slate-500 dark:text-slate-300 group-hover:text-slate-700 dark:group-hover:text-slate-100 transition-colors">
                  Отвори →
                </div>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 min-h-[44px]">
                {GRADE_META[grade.grade_number]?.subtitle ?? 'Учебна програма по математика.'}
              </p>

              <div className="flex flex-wrap gap-2">
                {(GRADE_META[grade.grade_number]?.highlights ?? []).map((item) => (
                  <span key={item} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 dark:border dark:border-indigo-400/25 text-slate-700 dark:text-slate-200">
                    {item}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

      </main>
    </div>
  );
};

export default LearnGradesPage;