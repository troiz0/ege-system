import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  googleId?: string | null;
  telegramId?: string | null;
  telegramUsername?: string | null;
  subscriptionTier: string;
  isDemo: boolean;
  xp?: number;
  level?: number;
  onboardingCompleted?: boolean;
  role?: string;
  grade?: number | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  updateUser: (patch: Partial<User>) => void;
  updateUserXp: (xp: number, level: number) => void;
  updateUserGrade: (grade: number) => void;
  logout: () => void;
}

function getInitialAuth(): { user: User | null; isAuthenticated: boolean } {
  if (typeof window === 'undefined') return { user: null, isAuthenticated: false };
  try {
    const raw = localStorage.getItem('auth-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.user && parsed?.state?.isAuthenticated) {
        return { user: parsed.state.user, isAuthenticated: true };
      }
    }
  } catch {}
  return { user: null, isAuthenticated: false };
}

const initialAuth = getInitialAuth();

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: initialAuth.user,
      isAuthenticated: initialAuth.isAuthenticated,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      updateUser: (patch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...patch } : null,
        })),
      updateUserXp: (xp, level) =>
        set((state) => {
          if (!state.user) return state;
          if (state.user.xp === xp && state.user.level === level) return state;
          return { user: { ...state.user, xp, level } };
        }),
      updateUserGrade: (grade) =>
        set((state) => {
          if (!state.user) return state;
          if (state.user.grade === grade) return state;
          return { user: { ...state.user, grade } };
        }),
      logout: () => {
        set({ user: null, isAuthenticated: false });
        // Clear session cookie by calling logout API
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
