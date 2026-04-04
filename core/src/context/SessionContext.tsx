import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { getActiveSession, createSession as dbCreateSession, endSession as dbEndSession, SessionInfo } from '../utils/databaseHelper';

interface SessionContextType {
  session: SessionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  createNewSession: (name: string) => Promise<void>;
  endCurrentSession: () => Promise<{ ended: boolean; remaining: number }>;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getActiveSession();
      setSession(s);
    } catch (e) {
      console.error('[Session] refresh error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createNewSession = useCallback(async (name: string) => {
    try {
      const s = await dbCreateSession(name);
      setSession(s);
    } catch (e) {
      console.error('[Session] createNewSession error', e);
    }
  }, []);

  const endCurrentSession = useCallback(async () => {
    if (!session) return { ended: false, remaining: 0 };
    const result = await dbEndSession(session.id);
    setSession(null);
    return result;
  }, [session]);

  return (
    <SessionContext.Provider value={{ session, loading, refresh, createNewSession, endCurrentSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
