import { API_BASE_URL } from './api';

export type AnalyticsEventType =
  | 'login'
  | 'logout'
  | 'lesson_started'
  | 'lesson_completed'
  | 'exercise_completed'
  | 'ai_request'
  | 'nvo_started'
  | 'nvo_completed'
  | 'premium_clicked';

type AnalyticsMetadata = Record<string, unknown>;

interface TrackEventOptions {
  userId?: string;
}

function getStoredUserId(): string | undefined {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { id?: string | number };
    if (parsed?.id === undefined || parsed?.id === null) return undefined;
    return String(parsed.id);
  } catch {
    return undefined;
  }
}

function getCurrentRoute(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

export function trackEvent(
  eventType: AnalyticsEventType,
  metadata: AnalyticsMetadata = {},
  options: TrackEventOptions = {}
): void {
  const payload = {
    event_type: eventType,
    user_id: options.userId ?? getStoredUserId() ?? null,
    timestamp: new Date().toISOString(),
    metadata: {
      route: getCurrentRoute(),
      ...metadata,
    },
  };

  const endpoint = `${API_BASE_URL}/analytics/events`;

  // Non-blocking analytics dispatch with silent failure.
  try {
    const body = JSON.stringify(payload);

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
      return;
    }

    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Fail silently for analytics.
    });
  } catch {
    // Fail silently for analytics.
  }
}
