import React from 'react';

export type NVODifficulty = 'easy' | 'standard' | 'hard';

interface DifficultyOption {
  value: NVODifficulty;
  label: string;
  emoji: string;
  shortDescription: string;
  fullDescription: string;
  colorClasses: {
    border: string;
    bg: string;
    bgHover: string;
    text: string;
    badge: string;
    selectedRing: string;
  };
}

const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  {
    value: 'easy',
    label: 'Лесно',
    emoji: '🌱',
    shortDescription: 'Опростени задачи',
    fullDescription: 'Съдържанието е опростено спрямо стандартния материал. По-кратки обяснения, базови концепции и фокус върху разпознаване.',
    colorClasses: {
      border: 'border-green-200 dark:border-green-800',
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20',
      bgHover: 'hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-900/40 dark:hover:to-emerald-900/30',
      text: 'text-green-700 dark:text-green-300',
      badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
      selectedRing: 'ring-green-400 ring-offset-2',
    },
  },
  {
    value: 'standard',
    label: 'Стандартно',
    emoji: '📚',
    shortDescription: 'Като реалния НВО',
    fullDescription: 'Съдържанието съответства на стандартния НВО изпит. Без опростяване или увеличаване на трудността.',
    colorClasses: {
      border: 'border-blue-200 dark:border-blue-800',
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20',
      bgHover: 'hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/40 dark:hover:to-indigo-900/30',
      text: 'text-blue-700 dark:text-blue-300',
      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      selectedRing: 'ring-blue-400 ring-offset-2',
    },
  },
  {
    value: 'hard',
    label: 'Трудно',
    emoji: '🔥',
    shortDescription: 'Повишена сложност',
    fullDescription: 'Съдържанието е по-трудно от стандартния материал. Повишена сложност, по-дълбоки изводи, крайни случаи и комбинирани концепции.',
    colorClasses: {
      border: 'border-rose-200 dark:border-rose-800',
      bg: 'bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/20',
      bgHover: 'hover:from-rose-100 hover:to-orange-100 dark:hover:from-rose-900/40 dark:hover:to-orange-900/30',
      text: 'text-rose-700 dark:text-rose-300',
      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
      selectedRing: 'ring-rose-400 ring-offset-2',
    },
  },
];

interface NVODifficultySelectorProps {
  selected: NVODifficulty;
  onSelect: (difficulty: NVODifficulty) => void;
  disabled?: boolean;
}

const NVODifficultySelector: React.FC<NVODifficultySelectorProps> = ({
  selected,
  onSelect,
  disabled = false,
}) => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Избери ниво на трудност
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Какво ниво на сложност искаш за генерирания НВО тест?
        </p>
      </div>

      {/* Difficulty Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DIFFICULTY_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => !disabled && onSelect(option.value)}
              disabled={disabled}
              className={`
                relative group rounded-2xl border-2 p-4 text-left transition-all duration-200
                ${option.colorClasses.border}
                ${option.colorClasses.bg}
                ${!disabled ? option.colorClasses.bgHover : ''}
                ${isSelected ? `ring-2 ${option.colorClasses.selectedRing}` : ''}
                ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'}
              `}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute -top-2 -right-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-sm shadow-sm">
                    ✓
                  </span>
                </div>
              )}

              {/* Content */}
              <div className="space-y-3">
                {/* Emoji & Label */}
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{option.emoji}</span>
                  <span className={`text-sm font-bold ${option.colorClasses.text}`}>
                    {option.label}
                  </span>
                </div>

                {/* Short description badge */}
                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${option.colorClasses.badge}`}>
                  {option.shortDescription}
                </span>

                {/* Full description */}
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {option.fullDescription}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Current selection indicator */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Избрано:</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
          DIFFICULTY_OPTIONS.find(o => o.value === selected)?.colorClasses.badge
        }`}>
          {DIFFICULTY_OPTIONS.find(o => o.value === selected)?.emoji}
          {DIFFICULTY_OPTIONS.find(o => o.value === selected)?.label}
        </span>
      </div>
    </div>
  );
};

export default NVODifficultySelector;
