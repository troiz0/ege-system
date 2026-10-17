import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  subscriptionTier: string;
  isDemo: boolean;
  xp?: number;
  level?: number;
  onboardingCompleted?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  updateUserXp: (xp: number, level: number) => void;
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
      updateUserXp: (xp, level) =>
        set((state) => ({
          user: state.user ? { ...state.user, xp, level } : null,
        })),
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
