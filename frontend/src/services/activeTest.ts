import { withUserScope } from '../utils/userIdentity';

export type ActiveTestProblem = {
  id: number;
  label: string;
  type: 'open';
};

export const ACTIVE_TEST_DATA_STORAGE_KEY = 'pairing-active-test-data-v1';
export const ACTIVE_TEST_DATA_EVENT = 'active-test-data-updated';

const isActiveTestProblem = (value: unknown): value is ActiveTestProblem => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'number' &&
    Number.isFinite(candidate.id) &&
    typeof candidate.label === 'string' &&
    candidate.label.trim().length > 0 &&
    candidate.type === 'open'
  );
};

export const readActiveTestData = (): ActiveTestProblem[] => {
  const storageKey = withUserScope(ACTIVE_TEST_DATA_STORAGE_KEY);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActiveTestProblem);
  } catch {
    return [];
  }
};

export const publishActiveTestData = (problems: ActiveTestProblem[]): void => {
  const storageKey = withUserScope(ACTIVE_TEST_DATA_STORAGE_KEY);
  localStorage.setItem(storageKey, JSON.stringify(problems));
  window.dispatchEvent(new CustomEvent<ActiveTestProblem[]>(ACTIVE_TEST_DATA_EVENT, { detail: problems }));
};

export const clearActiveTestData = (): void => {
  const storageKey = withUserScope(ACTIVE_TEST_DATA_STORAGE_KEY);
  localStorage.removeItem(storageKey);
  window.dispatchEvent(new CustomEvent<ActiveTestProblem[]>(ACTIVE_TEST_DATA_EVENT, { detail: [] }));
};
