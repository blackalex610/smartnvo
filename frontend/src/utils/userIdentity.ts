type StoredUser = {
  id?: string | number;
};

export const getStoredUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const user = JSON.parse(raw) as StoredUser;
    if (!user?.id) return null;
    return String(user.id);
  } catch {
    return null;
  }
};

export const withUserScope = (baseKey: string): string => {
  const userId = getStoredUserId();
  return userId ? `${baseKey}:${userId}` : `${baseKey}:anon`;
};
