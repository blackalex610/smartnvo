/**
 * usePlanPrompt — controls when the upgrade prompt should appear.
 *
 * Rules (from Step 1 design):
 *   1. Never show in the first 3 days after signup (honeymoon period).
 *   2. Max 1 prompt per browser session (sessionStorage flag).
 *   3. Only show when a hard limit is actually hit (429 response).
 *   4. Never interrupt mid-exercise — caller decides when to call `maybeShow`.
 */
import { useCallback } from 'react';

const SESSION_KEY = 'upgrade_prompt_shown';
const HONEYMOON_DAYS = 3;

interface ShowOptions {
  feature: string;
  message: string;
  daysSinceSignup: number;
  isPremium: boolean;
}

export function usePlanPrompt(setPrompt: (v: { feature: string; message: string } | null) => void) {
  const dismiss = useCallback(() => {
    setPrompt(null);
  }, [setPrompt]);

  const maybeShow = useCallback(
    ({ feature, message, daysSinceSignup, isPremium }: ShowOptions) => {
      // Never show to premium users
      if (isPremium) return;

      // Honeymoon: don't annoy new users in first 3 days
      if (daysSinceSignup < HONEYMOON_DAYS) return;

      // Once per session
      if (sessionStorage.getItem(SESSION_KEY)) return;

      sessionStorage.setItem(SESSION_KEY, '1');
      setPrompt({ feature, message });
    },
    [setPrompt],
  );

  return { maybeShow, dismiss };
}
