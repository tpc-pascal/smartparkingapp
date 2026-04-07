import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
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

  const value = useMemo(() => ({ attendantId, attendantName, login, logout, deleteAccount }), [attendantId, attendantName, login, logout, deleteAccount]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
