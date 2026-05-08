// Powered by OnSpace.AI
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { StorageService } from '@/services/storage';
import { ApiService, User } from '@/services/api';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updatePhone: (phone: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    try {
      const [savedUser, savedToken] = await Promise.all([
        StorageService.getUser(),
        StorageService.getToken(),
      ]);
      if (savedUser && savedToken) {
        setUser(savedUser);
        setToken(savedToken);
      }
    } catch (e) {
      console.error('Session load error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const res = await ApiService.login(username, password);
    await StorageService.saveUser(res.user, res.token);
    setUser(res.user);
    setToken(res.token);
  }

  async function logout() {
    await StorageService.clearSession();
    setUser(null);
    setToken(null);
  }

  async function refreshUser() {
    const saved = await StorageService.getUser();
    if (saved) setUser(saved);
  }

  async function updatePhone(phone: string) {
    if (!user) return;
    await ApiService.updateUserPhone(user.id, phone);
    const updatedUser = { ...user, phone };
    setUser(updatedUser);
    const currentToken = await StorageService.getToken();
    if (currentToken) {
      await StorageService.saveUser(updatedUser, currentToken);
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser, updatePhone }}>
      {children}
    </AuthContext.Provider>
  );
}
