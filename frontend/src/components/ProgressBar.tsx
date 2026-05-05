import React from 'react';

interface ProgressBarProps {
  percentage: number;
  color?: 'blue' | 'green' | 'yellow' | 'red';
  showLabel?: boolean;
  height?: 'sm' | 'md' | 'lg';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  percentage,
  color = 'blue',
  showLabel = true,
  height = 'md'
}) => {
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  
  const colorClasses = {
    blue: 'bg-blue-600 dark:bg-blue-500',
    green: 'bg-green-600 dark:bg-emerald-500',
    yellow: 'bg-yellow-500 dark:bg-amber-400',
    red: 'bg-red-600 dark:bg-rose-500'
  };
  
  const heightClasses = {
    sm: 'h-2',
    md: 'h-4',
    lg: 'h-6'
  };
  
  return (
    <div className="w-full">
      <div className={`w-full bg-gray-200 dark:bg-slate-700/75 rounded-full overflow-hidden ${heightClasses[height]}`}>
        <div
          className={`${colorClasses[color]} h-full transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 text-sm text-gray-600 dark:text-slate-300 text-right">
          {clampedPercentage.toFixed(0)}%
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
