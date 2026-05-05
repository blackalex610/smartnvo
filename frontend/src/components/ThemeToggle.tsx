import React from 'react';
import type { ThemeMode } from '../context/SettingsContext';

type ThemeToggleProps = {
  value: ThemeMode;
  onChange: (theme: ThemeMode) => void;
};

const options: Array<{ value: ThemeMode; label: string; description: string }> = [
  { value: 'light', label: 'Light', description: 'Bright surfaces and soft contrast' },
  { value: 'dark', label: 'Dark', description: 'Low-glare interface for focused work' },
];

const ThemeToggle: React.FC<ThemeToggleProps> = ({ value, onChange }) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border px-4 py-4 text-left transition-all ${
              active
                ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{option.label}</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  active ? 'bg-white' : 'bg-gray-300 dark:bg-slate-500'
                }`}
              />
            </div>
            <p className={`mt-2 text-sm ${active ? 'text-blue-100' : 'text-gray-500 dark:text-slate-400'}`}>
              {option.description}
            </p>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;