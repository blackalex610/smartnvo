import React from 'react';

export type NVOFormat = 'full' | 'short';

interface FormatOption {
  value: NVOFormat;
  label: string;
  emoji: string;
  problemCount: string;
  duration: string;
  description: string;
  features: string[];
  colorClasses: {
    border: string;
    bg: string;
    bgHover: string;
    text: string;
    badge: string;
    selectedRing: string;
  };
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'short',
    label: 'Кратък НВО',
    emoji: '⚡',
    problemCount: '16 Задачи',
    duration: '30 Минути',
    description: 'Бърз тест / практика режим',
    features: [
      'Модул 1: 15 задачи',
      'Модул 2: 1 задача',
      'Бързо завършване',
      'По-нисък XP таван',
    ],
    colorClasses: {
      border: 'border-emerald-200 dark:border-emerald-800',
      bg: 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20',
      bgHover: 'hover:from-emerald-100 hover:to-teal-100 dark:hover:from-emerald-900/40 dark:hover:to-teal-900/30',
      text: 'text-emerald-700 dark:text-emerald-300',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      selectedRing: 'ring-emerald-400 ring-offset-2',
    },
  },
  {
    value: 'full',
    label: 'Пълен НВО',
    emoji: '📋',
    problemCount: '23 Задачи',
    duration: '90 Минути',
    description: 'Пълен изпитен опит',
    features: [
      'Модул 1: 20 задачи',
      'Модул 2: 3 задачи',
      'Пълна оценка',
      'Максимален XP потенциал',
    ],
    colorClasses: {
      border: 'border-indigo-200 dark:border-indigo-800',
      bg: 'bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/20',
      bgHover: 'hover:from-indigo-100 hover:to-violet-100 dark:hover:from-indigo-900/40 dark:hover:to-violet-900/30',
      text: 'text-indigo-700 dark:text-indigo-300',
      badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
      selectedRing: 'ring-indigo-400 ring-offset-2',
    },
  },
];

interface NVOFormatSelectorProps {
  selected: NVOFormat;
  onSelect: (format: NVOFormat) => void;
  disabled?: boolean;
}

const NVOFormatSelector: React.FC<NVOFormatSelectorProps> = ({
  selected,
  onSelect,
  disabled = false,
}) => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Избери формат на теста
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Какъв тип НВО искаш да решаваш?
        </p>
      </div>

      {/* Format Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FORMAT_OPTIONS.map((option) => {
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

                {/* Stats badges */}
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${option.colorClasses.badge}`}>
                    {option.problemCount}
                  </span>
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${option.colorClasses.badge}`}>
                    {option.duration}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {option.description}
                </p>

                {/* Features list */}
                <ul className="space-y-1">
                  {option.features.map((feature, idx) => (
                    <li key={idx} className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1">
                      <span className="text-emerald-500">•</span> {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          );
        })}
      </div>

      {/* Current selection indicator */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Избран формат:</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
          FORMAT_OPTIONS.find(o => o.value === selected)?.colorClasses.badge
        }`}>
          {FORMAT_OPTIONS.find(o => o.value === selected)?.emoji}
          {FORMAT_OPTIONS.find(o => o.value === selected)?.label}
        </span>
      </div>
    </div>
  );
};

export default NVOFormatSelector;
