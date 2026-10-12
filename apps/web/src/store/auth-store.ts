import { create } from 'zustand';

interface AuthState {
  loading: boolean;
  remainingAttempts: number;
  isLocked: boolean;
  lockedIdentifier: string | null;
  banExpiresAt: string | null;
  banRemainingSeconds: number | null;
  
  setLoading: (loading: boolean) => void;
  setLockoutState: (state: Partial<Pick<AuthState, 'remainingAttempts' | 'isLocked' | 'lockedIdentifier' | 'banExpiresAt' | 'banRemainingSeconds'>>) => void;
  decrementAttempts: () => void;
  tickRemainingSeconds: () => void;
  resetLockout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  loading: false,
  remainingAttempts: 5,
  isLocked: false,
  lockedIdentifier: null,
  banExpiresAt: null,
  banRemainingSeconds: null,

  setLoading: (loading) => set({ loading }),
  setLockoutState: (state) => set((prev) => ({ ...prev, ...state })),
  decrementAttempts: () =>
    set((state) => {
      const nextAttempts = Math.max(0, state.remainingAttempts - 1);
      return { remainingAttempts: nextAttempts };
    }),
  tickRemainingSeconds: () =>
    set((state) => {
      if (state.banRemainingSeconds === null) return {};
      const nextSecs = Math.max(0, state.banRemainingSeconds - 1);
      if (nextSecs <= 0) {
        return {
          isLocked: false,
          lockedIdentifier: null,
          banExpiresAt: null,
          banRemainingSeconds: null,
          remainingAttempts: 5,
        };
      }
      return { banRemainingSeconds: nextSecs };
    }),
  resetLockout: () =>
    set({
      remainingAttempts: 5,
      isLocked: false,
      lockedIdentifier: null,
      banExpiresAt: null,
      banRemainingSeconds: null,
    }),
}));
