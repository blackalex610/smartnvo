import React from 'react';
import '../styles/UsageIndicator.css';

export interface UsageInfo {
  feature: string;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

interface UsageIndicatorProps {
  usage?: UsageInfo;
  compact?: boolean;
}

export const UsageIndicator: React.FC<UsageIndicatorProps> = ({
  usage,
  compact = false
}) => {
  if (!usage || usage.limit === 0) return null;

  const isWarning = usage.remaining <= 2;
  const isCritical = usage.remaining === 0;

  if (compact) {
    // Minimal badge for sidebars
    return (
      <div className={`usage-badge ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}>
        {usage.remaining}/{usage.limit}
      </div>
    );
  }

  // Full usage indicator
  return (
    <div className="usage-indicator">
      <div className="usage-header">
        <span className="usage-label">{usage.label}</span>
        <span className="usage-count">
          {usage.used}/{usage.limit}
        </span>
      </div>
      
      <div className="usage-bar-container">
        <div className="usage-bar-track">
          <div 
            className={`usage-bar-fill ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}
            style={{ width: `${Math.min(usage.percentage, 100)}%` }}
          />
        </div>
      </div>
      
      <div className="usage-footer">
        {usage.remaining > 0 ? (
          <span className="usage-remaining">
            {usage.remaining} осталося днес
          </span>
        ) : (
          <span className="usage-limit-hit">
            Дневния лимит е достигнат
          </span>
        )}
      </div>
    </div>
  );
};

export default UsageIndicator;
