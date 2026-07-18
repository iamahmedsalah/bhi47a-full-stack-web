export interface SavedGoogleAccount {
  name: string;
  email: string;
  avatarUrl?: string;
}

export const GOOGLE_ACCOUNT_STORAGE_KEY = 'student_portal_last_google_account';
export const GOOGLE_ACCOUNT_CHANGED_EVENT = 'student-portal:last-google-account-changed';

function isSavedGoogleAccount(value: unknown): value is SavedGoogleAccount {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' && typeof record.email === 'string';
}

export function loadSavedGoogleAccount(): SavedGoogleAccount | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(GOOGLE_ACCOUNT_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isSavedGoogleAccount(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGoogleAccount(account: SavedGoogleAccount) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(GOOGLE_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  window.dispatchEvent(
    new CustomEvent(GOOGLE_ACCOUNT_CHANGED_EVENT, { detail: account }),
  );
}

export function clearSavedGoogleAccount() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(GOOGLE_ACCOUNT_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent(GOOGLE_ACCOUNT_CHANGED_EVENT, { detail: null }),
  );
}

export function readGoogleAccountFromCredential(
  credential: string,
): SavedGoogleAccount | null {
  try {
    const [, payload] = credential.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(window.atob(normalized)) as Record<string, unknown>;
    const email = typeof decoded.email === 'string' ? decoded.email : '';
    if (!email) return null;

    return {
      email,
      name: typeof decoded.name === 'string' ? decoded.name : email,
      avatarUrl: typeof decoded.picture === 'string' ? decoded.picture : undefined,
    };
  } catch {
    return null;
  }
}
