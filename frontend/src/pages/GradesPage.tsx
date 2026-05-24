import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGrades, type Grade } from '../services/curriculum';
import AppNavbar from '../components/AppNavbar';
import { TopicsSkeleton } from '../components/Skeleton';

const GRADE_META: Record<number, { subtitle: string; highlights: string[]; accent: string }> = {
  5: {
    subtitle: 'Задачи за упражняване на основни операции с числа и геометрия',
    highlights: ['Числови задачи', 'Геометрични фигури', 'Логически задачи'],
    accent: 'from-blue-500 to-cyan-500',
  },
  6: {
    subtitle: 'Упражнения върху цели числа, уравнения и обеми',
    highlights: ['Уравнения', 'Процентни задачи', 'Пространствени фигури'],
    accent: 'from-slate-500 to-[#1c4270]',
  },
  7: {
    subtitle: 'Предизвикателни задачи по алгебра, системи и координатна геометрия',
    highlights: ['Системи уравнения', 'Функции', 'Аналитична геометрия'],
    accent: 'from-orange-500 to-amber-500',
  },
};

const GradesPage: React.FC = () => {
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
    <div className="min-h-screen bg-slate-50">
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        <section className="mb-10 bg-white border border-slate-200 rounded-xl p-6 md:p-10 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 mb-3">
            Практика
          </p>
          <h2 className="text-3xl md:text-4xl font-black text-[#1c4270] leading-tight">
            Решавай задачи и
            <span className="text-[#1c4270]"> провери уменията си</span>
          </h2>
          <p className="mt-4 text-slate-600 max-w-3xl text-base md:text-lg">
            Изберете клас и се упражнявайте с разнообразни задачи във всяка категория.
            Всяка задача има решение и обяснение стъпка по стъпка.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">Класове</p>
              <p className="text-2xl font-bold text-[#1c4270]">3</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">Категории</p>
              <p className="text-2xl font-bold text-[#1c4270]">12</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">Уроци</p>
              <p className="text-2xl font-bold text-[#1c4270]">63</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">Тип</p>
              <p className="text-2xl font-bold text-[#1c4270]">BG</p>
            </div>
          </div>
        </section>

        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl md:text-2xl font-bold text-[#1c4270]">Избери клас</h3>
          <span className="text-sm text-slate-400">Клас → категория → урок → задачи</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {grades.map((grade) => (
            <button
              key={grade.id}
              onClick={() => navigate(`/grades/${grade.id}/topics`)}
              className="group bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-left hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="h-1 w-full rounded-full bg-[#1c4270] mb-5" />
              <div className="flex items-end justify-between mb-3">
                <div className="text-2xl font-black text-[#1c4270] leading-none">
                  {grade.grade_number} клас
                </div>
                <div className="text-sm font-semibold text-slate-400 group-hover:text-[#1c4270] transition-colors inline-flex items-center gap-1">
                  Отвори <span className="motion-icon">→</span>
                </div>
              </div>

              <p className="text-sm text-slate-500 mb-4 min-h-[44px]">
                {GRADE_META[grade.grade_number]?.subtitle ?? 'Задачи по математика.'}
              </p>

              <div className="flex flex-wrap gap-2">
                {(GRADE_META[grade.grade_number]?.highlights ?? []).map((item) => (
                  <span key={item} className="text-xs px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[#1c4270]">
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

export default GradesPage;
