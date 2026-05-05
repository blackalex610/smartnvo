import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentType = 'exercise' | 'explanation' | 'chat' | 'lesson' | 'nvo_exam';
type Reason = 'too_hard' | 'too_confusing' | 'wrong_answer' | 'not_helpful' | 'other';

interface FeedbackButtonsProps {
  contentType: ContentType;
  contentId?: string;
  topic?: string;
  difficulty?: string;
  userId?: string;
  /** Extra label shown before the buttons, e.g. "Беше ли полезно?" */
  label?: string;
  /** Small/compact mode for inline use inside chat bubbles */
  compact?: boolean;
}

const REASONS: { value: Reason; label: string }[] = [
  { value: 'too_hard',      label: 'Твърде трудно' },
  { value: 'too_confusing', label: 'Объркващо' },
  { value: 'wrong_answer',  label: 'Грешен отговор' },
  { value: 'not_helpful',   label: 'Не помогна' },
  { value: 'other',         label: 'Друго' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const FeedbackButtons: React.FC<FeedbackButtonsProps> = ({
  contentType,
  contentId,
  topic,
  difficulty,
  userId,
  label = 'Беше ли полезно?',
  compact = false,
}) => {
  const [step, setStep] = useState<'idle' | 'thumbs_down_reasons' | 'done'>('idle');
  const [selectedReason, setSelectedReason] = useState<Reason | null>(null);
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);

  const send = useCallback(
    async (isHelpful: boolean, reason?: Reason) => {
      try {
        await axios.post(`${API_BASE_URL}/feedback`, {
          is_helpful: isHelpful,
          content_type: contentType,
          content_id: contentId ?? null,
          reason: reason ?? null,
          user_id: userId ?? localStorage.getItem('userId') ?? null,
          timestamp: new Date().toISOString(),
          topic: topic ?? null,
          difficulty: difficulty ?? null,
          route: window.location.pathname,
        });
      } catch {
        // Silently fail — feedback is non-critical
      }
    },
    [contentType, contentId, topic, difficulty, userId],
  );

  const handleThumbsUp = useCallback(async () => {
    setVoted('up');
    setStep('done');
    await send(true);
  }, [send]);

  const handleThumbsDown = useCallback(() => {
    setVoted('down');
    setStep('thumbs_down_reasons');
    send(false); // Send immediately — reason is optional
  }, [send]);

  const handleReason = useCallback(
    async (reason: Reason) => {
      setSelectedReason(reason);
      setStep('done');
      // Re-send with reason attached
      await send(false, reason);
    },
    [send],
  );

  if (step === 'done') {
    return (
      <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'} text-slate-400 dark:text-slate-500`}>
        <span>{voted === 'up' ? '👍' : '👎'}</span>
        <span>Благодарим за обратната връзка!</span>
      </div>
    );
  }

  if (step === 'thumbs_down_reasons') {
    return (
      <div className="flex flex-col gap-2">
        <p className={`${compact ? 'text-xs' : 'text-sm'} text-slate-500 dark:text-slate-400`}>
          Какво не беше наред?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => handleReason(r.value)}
              className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:border-red-700 dark:hover:text-red-400 transition-colors"
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setStep('done')}
          className="text-[11px] text-slate-400 hover:text-slate-500 self-start"
        >
          Пропусни →
        </button>
      </div>
    );
  }

  // idle state
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'mt-1'}`}>
      {!compact && (
        <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      )}
      <button
        onClick={handleThumbsUp}
        title="Полезно"
        className="rounded-lg px-2 py-1 text-base leading-none hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
      >
        👍
      </button>
      <button
        onClick={handleThumbsDown}
        title="Не беше полезно"
        className="rounded-lg px-2 py-1 text-base leading-none hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        👎
      </button>
    </div>
  );
};

export default FeedbackButtons;
