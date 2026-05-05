import React from 'react';
import type { StreakData } from '../hooks/useStreak';

interface StreakWidgetProps {
  streak: StreakData;
  exercisesToday: number;
  exercisesGoal?: number;
  lessonsToday: number;
  lessonsGoal?: number;
}

const StreakWidget: React.FC<StreakWidgetProps> = ({
  streak,
  exercisesToday,
  exercisesGoal = 5,
  lessonsToday,
  lessonsGoal = 1,
}) => {
  const exDone = exercisesToday >= exercisesGoal;
  const lesDone = lessonsToday >= lessonsGoal;
  const allDone = exDone && lesDone;

  return (
    <div className={`rounded-2xl border p-5 mb-8 transition-all ${
      allDone
        ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-orange-200 dark:from-amber-950/40 dark:to-orange-950/40 dark:border-orange-600/40'
        : 'bg-white border-gray-100 dark:bg-slate-900/60 dark:border-slate-700/50'
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Streak counter */}
        <div className="flex items-center gap-3">
          <div className={`text-4xl transition-transform ${streak.count > 0 ? 'animate-bounce' : ''}`}
               style={{ animationIterationCount: 1 }}>
            🔥
          </div>
          <div>
            <p className="text-2xl font-extrabold text-orange-500 leading-none">
              {streak.count} <span className="text-base font-semibold text-gray-500 dark:text-slate-400">дни поред</span>
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Рекорд: {streak.longestStreak} {streak.longestStreak === 1 ? 'ден' : 'дни'}
            </p>
          </div>
        </div>

        {/* Daily goals */}
        <div className="flex flex-col gap-2 min-w-[200px]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">
            Дневни цели
          </p>
          <Goal
            label={`Реши ${exercisesGoal} задачи`}
            current={Math.min(exercisesToday, exercisesGoal)}
            total={exercisesGoal}
            done={exDone}
            color="blue"
          />
          <Goal
            label={`Отвори ${lessonsGoal} урок`}
            current={Math.min(lessonsToday, lessonsGoal)}
            total={lessonsGoal}
            done={lesDone}
            color="violet"
          />
        </div>
      </div>

      {allDone && (
        <div className="mt-3 text-sm font-semibold text-orange-600 dark:text-orange-300 text-center">
          🎉 Браво! Изпълни всички цели за днес!
        </div>
      )}
    </div>
  );
};

const COLORS = {
  blue: {
    bar: 'bg-blue-500',
    track: 'bg-blue-100 dark:bg-blue-950/50',
    check: 'text-blue-600 dark:text-blue-300',
  },
  violet: {
    bar: 'bg-violet-500',
    track: 'bg-violet-100 dark:bg-violet-950/50',
    check: 'text-violet-600 dark:text-violet-300',
  },
};

const Goal: React.FC<{
  label: string;
  current: number;
  total: number;
  done: boolean;
  color: 'blue' | 'violet';
}> = ({ label, current, total, done, color }) => {
  const c = COLORS[color];
  const pct = Math.round((current / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className={`text-base flex-shrink-0 ${done ? c.check : 'text-gray-300 dark:text-slate-600'}`}>
        {done ? '✓' : '○'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs mb-0.5">
          <span className={`font-medium ${done ? 'line-through text-gray-400 dark:text-slate-500' : 'text-gray-700 dark:text-slate-200'}`}>
            {label}
          </span>
          <span className="text-gray-400 dark:text-slate-500">{current}/{total}</span>
        </div>
        <div className={`h-1.5 rounded-full ${c.track}`}>
          <div
            className={`h-1.5 rounded-full ${c.bar} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default StreakWidget;
