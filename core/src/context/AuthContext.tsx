import React, { createContext, useContext, useState, useCallback } from 'react';
import { logout as dbLogout, deleteAccount as dbDeleteAccount } from '../utils/databaseHelper';

interface AuthContextType {
  attendantId: number;
  attendantName: string;
  login: (id: number, name: string) => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [attendantId, setAttendantId] = useState(0);
  const [attendantName, setAttendantName] = useState('');

  const login = useCallback((id: number, name: string) => {
    setAttendantId(id);
    setAttendantName(name);
  }, []);

  const logout = useCallback(async () => {
    try { await dbLogout(); } catch {}
    setAttendantId(0);
    setAttendantName('');
  }, []);

  const deleteAccount = useCallback(async () => {
    try { await dbDeleteAccount(); } catch {}
    setAttendantId(0);
    setAttendantName('');
  }, []);

  return (
    <AuthContext.Provider value={{ attendantId, attendantName, login, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
