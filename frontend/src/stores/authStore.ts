import { create } from 'zustand';
import type { User } from '@/types';
import { register, login, ApiError } from '@/services/api';
import { setStoredToken, getStoredToken, removeStoredToken, setStoredUser, getStoredUser, removeStoredUser } from '@/utils/storage';

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: false,
  error: null,
  
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const result = await login(email, password);
      setStoredToken(result.token);
      setStoredUser(JSON.stringify(result.user));
      set({ user: result.user, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? error.message 
        : error instanceof Error 
          ? error.message 
          : '登录失败';
      set({ error: errorMessage, isLoading: false });
    }
  },
  
  register: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await register(email, password);
      // 注册后自动登录
      const loginResult = await login(email, password);
      setStoredToken(loginResult.token);
      setStoredUser(JSON.stringify(loginResult.user));
      set({ user: loginResult.user, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? error.message 
        : error instanceof Error 
          ? error.message 
          : '注册失败';
      set({ error: errorMessage, isLoading: false });
    }
  },
  
  logout: () => {
    removeStoredToken();
    removeStoredUser();
    set({ user: null, error: null });
  },
  
  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const token = getStoredToken();
      const userStr = getStoredUser();
      
      if (token && userStr) {
        const user = JSON.parse(userStr) as User;
        set({ user, isLoading: false });
        return;
      }
      
      set({ user: null, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
}));