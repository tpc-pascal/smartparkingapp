import { NativeModules } from 'react-native';

const { DatabaseModule } = NativeModules;

// ── Native Module Return Types ──

interface NativeAttendantResult {
  id: number;
  fullName: string;
  email?: string;
  isSynced?: boolean;
}

interface NativeSessionResult {
  id: number;
  name: string;
  status: string;
  createdAt: string;
  endedAt?: string;
  closedOldSession?: string;
}

interface NativeLogRow {
  id: number;
  licensePlate: string;
  timeIn: string;
  timeOut?: string;
  sessionId: number;
  isSynced?: boolean;
  serverId?: number;
  entryImage?: string;
  exitImage?: string;
  fee?: number;
}

interface NativeEndSessionResult {
  ended: boolean;
  remaining: number;
}

interface NativeStatsResult {
  entryCount: number;
  exitCount: number;
  parkedCount: number;
}

// ── Exported Types ──

export interface AttendantResult {
  id: number;
  fullName: string;
}

export interface AttendantDetail extends AttendantResult {
  email: string;
  isSynced: boolean;
}

export interface ParkingLogResult {
  id: number;
  licensePlate: string;
  timeIn: string;
  timeOut?: string;
  entryImage?: string;
  exitImage?: string;
  fee?: number;
  sessionId: number;
}

export interface SessionInfo {
  id: number;
  name: string;
  status: string;
  createdAt: string;
  endedAt?: string;
  closedOldSession?: string;
}

export interface TodayStats {
  entryCount: number;
  exitCount: number;
  parkedCount: number;
}

export type SqlResult = Record<string, unknown>;

// ── Helpers ──

const db = {
  getAttendantById: (id: number) =>
    (DatabaseModule?.getAttendantById(id) as Promise<NativeAttendantResult>),
  registerAttendant: (email: string, password: string) =>
    (DatabaseModule?.registerAttendant(email, password) as Promise<NativeAttendantResult>),
  loginAttendant: (email: string, password: string) =>
    (DatabaseModule?.loginAttendant(email, password) as Promise<NativeAttendantResult>),
  getActiveSession: () =>
    (DatabaseModule?.getActiveSession() as Promise<NativeSessionResult | null>),
  createSession: (name: string) =>
    (DatabaseModule?.createSession(name) as Promise<NativeSessionResult>),
  endSession: (sessionId: number) =>
    (DatabaseModule?.endSession(sessionId) as Promise<NativeEndSessionResult>),
  getRemainingCount: (sessionId: number) =>
    (DatabaseModule?.getRemainingCount(sessionId) as Promise<number>),
  getSession: () =>
    (DatabaseModule?.getSession() as Promise<NativeAttendantResult | null>),
  executeSql: (sql: string) =>
    (DatabaseModule?.executeSql(sql) as Promise<SqlResult[]>),
  verifySessionOnSupabase: () =>
    (DatabaseModule?.verifySessionOnSupabase() as Promise<boolean>),
  logout: () =>
    (DatabaseModule?.logout() as Promise<true>),
  deleteAccount: () =>
    (DatabaseModule?.deleteAccount() as Promise<true>),
  recordEntry: (licensePlate: string, sessionId: number) =>
    (DatabaseModule?.recordEntry(licensePlate, sessionId) as Promise<{ id: number }>),
  recordEntryFull: (licensePlate: string, timestamp: string, entryImage: string | null, sessionId: number) =>
    (DatabaseModule?.recordEntryFull(licensePlate, timestamp, entryImage, sessionId) as Promise<{ id: number }>),
  recordEntryWithTimestamp: (licensePlate: string, sessionId: number, timestamp: string) =>
    (DatabaseModule?.recordEntryWithTimestamp(licensePlate, sessionId, timestamp) as Promise<{ id: number }>),
  recordExit: (licensePlate: string) =>
    (DatabaseModule?.recordExit(licensePlate) as Promise<number>),
  recordExitFull: (licensePlate: string, exitImage: string | null) =>
    (DatabaseModule?.recordExitFull(licensePlate, exitImage) as Promise<number>),
  getCurrentlyParked: () =>
    (DatabaseModule?.getCurrentlyParked() as Promise<NativeLogRow[]>),
  getTodayStats: (sessionId: number | null) =>
    (DatabaseModule?.getTodayStats(sessionId) as Promise<NativeStatsResult>),
  searchParkingLogs: (query: string | null, parked: string | null, exited: string | null, sessionId: number | null, offset: number, limit: number) =>
    (DatabaseModule?.searchParkingLogs(query, parked, exited, sessionId, offset, limit) as Promise<NativeLogRow[]>),
  triggerSync: () =>
    (DatabaseModule?.triggerSync() as Promise<true>),
  dumpDatabase: () =>
    (DatabaseModule?.dumpDatabase() as Promise<string>),
  clearAllTables: () =>
    DatabaseModule?.clearAllTables() as Promise<void>,
  deleteSupabaseTable: (tableName: string) =>
    (DatabaseModule?.deleteSupabaseTable(tableName) as Promise<boolean>),
  deleteAllSupabaseTables: () =>
    (DatabaseModule?.deleteAllSupabaseTables() as Promise<boolean>),
  clearTable: (tableName: string) =>
    (DatabaseModule?.clearTable(tableName) as Promise<true>),
  sendResetCode: (email: string) =>
    (DatabaseModule?.sendResetCode(email) as Promise<boolean>),
  verifyResetCode: (email: string, code: string, newPassword: string) =>
    (DatabaseModule?.verifyResetCode(email, code, newPassword) as Promise<boolean>),
  checkEmail: (email: string) =>
    (DatabaseModule?.checkEmail(email) as Promise<boolean>),
  getDebugLogs: (count: number) =>
    (DatabaseModule?.getDebugLogs(count) as Promise<string[]>),
  isOnline: () =>
    (DatabaseModule?.isOnline() as Promise<boolean>),
  getAllSessions: () =>
    (DatabaseModule?.getAllSessions() as Promise<NativeSessionResult[]>),
  getParkingLogsBySession: (sessionId: number) =>
    (DatabaseModule?.getParkingLogsBySession(sessionId) as Promise<NativeLogRow[]>),
};

// ── Public API ──

export async function checkEmail(email: string): Promise<boolean> {
  if (!DatabaseModule) return false;
  return db.checkEmail(email);
}

export async function getDebugLogs(count?: number): Promise<string[]> {
  if (!DatabaseModule) return [];
  return db.getDebugLogs(count || 100);
}

export async function isOnline(): Promise<boolean> {
  if (!DatabaseModule) return false;
  return db.isOnline();
}

export async function getAllSessions(): Promise<SessionInfo[]> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result = await db.getAllSessions();
  return result.map(s => ({
    id: s.id, name: s.name, status: s.status,
    createdAt: s.createdAt, endedAt: s.endedAt,
  }));
}

export async function getAttendantById(id: number): Promise<AttendantDetail> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const r = await db.getAttendantById(id);
  return { id: r.id, fullName: r.fullName, email: r.email ?? '', isSynced: r.isSynced ?? false };
}

export async function registerAttendant(email: string, password: string): Promise<AttendantResult> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const r = await db.registerAttendant(email, password);
  return { id: r.id, fullName: r.fullName };
}

export async function loginAttendant(email: string, password: string): Promise<AttendantResult> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const r = await db.loginAttendant(email, password);
  return { id: r.id, fullName: r.fullName };
}

export async function getActiveSession(): Promise<SessionInfo | null> {
  if (!DatabaseModule) return null;
  const result = await db.getActiveSession();
  if (!result) return null;
  return {
    id: result.id,
    name: result.name,
    status: result.status,
    createdAt: result.createdAt,
    endedAt: result.endedAt,
  };
}

export async function createSession(name: string): Promise<SessionInfo> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result = await db.createSession(name);
  return {
    id: result.id,
    name: result.name,
    status: result.status,
    createdAt: result.createdAt,
    endedAt: result.endedAt,
  };
}

export async function getOrCreateActiveSession(): Promise<SessionInfo> {
  const s = await getActiveSession();
  if (s) return s;
  return createSession('');
}

export async function endSession(sessionId: number): Promise<{ ended: boolean; remaining: number }> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  return db.endSession(sessionId);
}

export async function getRemainingCount(sessionId: number): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  return db.getRemainingCount(sessionId);
}

export async function getSession(): Promise<AttendantResult | null> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const r = await db.getSession();
  return r ? { id: r.id, fullName: r.fullName } : null;
}

export async function executeSql(sql: string): Promise<SqlResult[]> {
  try {
    const rows: SqlResult[] = await DatabaseModule.executeSql(sql);
    return rows ?? [];
  } catch (e) { console.error('[executeSql]', e); return []; }
}

export async function fetchSupabaseTable(tableName: string): Promise<SqlResult[]> {
  try {
    const rows: SqlResult[] = await DatabaseModule.fetchSupabaseTable(tableName);
    return rows ?? [];
  } catch (e) { console.error('[fetchSupabaseTable]', e); return []; }
}

export async function verifySessionOnSupabase(): Promise<boolean> {
  if (!DatabaseModule) return false;
  return db.verifySessionOnSupabase();
}

export async function logout(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await db.logout();
}

export async function deleteAccount(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await db.deleteAccount();
}

// ── Parking Entry / Exit ──

export async function recordEntry(licensePlate: string, sessionId: number): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result = await db.recordEntry(licensePlate, sessionId);
  return result.id;
}

export async function recordEntryFull(
  licensePlate: string,
  timestamp: string,
  entryImage?: string,
  sessionId?: number,
): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  if (!sessionId || sessionId <= 0) throw new Error('sessionId không hợp lệ');
  const result = await db.recordEntryFull(licensePlate, timestamp, entryImage || null, sessionId);
  return result.id;
}

export async function recordEntryWithTimestamp(licensePlate: string, sessionId: number, timestamp: string): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result = await db.recordEntryWithTimestamp(licensePlate, sessionId, timestamp);
  return result.id;
}

export async function recordExit(licensePlate: string): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await db.recordExit(licensePlate);
}

export async function recordExitFull(licensePlate: string, exitImage?: string): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await db.recordExitFull(licensePlate, exitImage || null);
}

// ── Queries ──

export async function getCurrentlyParked(): Promise<ParkingLogResult[]> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const array = await db.getCurrentlyParked();
  return array.map(item => ({
    id: item.id,
    licensePlate: item.licensePlate,
    timeIn: item.timeIn,
    sessionId: item.sessionId,
    entryImage: item.entryImage,
  }));
}

export async function getTodayStats(sessionId?: number): Promise<TodayStats> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  return db.getTodayStats(sessionId ?? null);
}

export async function searchParkingLogs(
  query?: string,
  onlyParked?: boolean,
  onlyExited?: boolean,
  sessionId?: number,
  offset?: number,
  limit?: number,
): Promise<ParkingLogResult[]> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const parkedStr = onlyParked ? 'true' : null;
  const exitedStr = onlyExited ? 'true' : null;
  const array = await db.searchParkingLogs(query || null, parkedStr, exitedStr, sessionId ?? null, offset || 0, limit || 50);
  return array.map(item => ({
    id: item.id,
    licensePlate: item.licensePlate,
    timeIn: item.timeIn,
    timeOut: item.timeOut,
    entryImage: item.entryImage,
    exitImage: item.exitImage,
    fee: item.fee,
    sessionId: item.sessionId,
  }));
}

export async function getParkingLogsBySession(sessionId: number): Promise<ParkingLogResult[]> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const array = await db.getParkingLogsBySession(sessionId);
  return array.map(item => ({
    id: item.id,
    licensePlate: item.licensePlate,
    timeIn: item.timeIn,
    timeOut: item.timeOut,
    entryImage: item.entryImage,
    exitImage: item.exitImage,
    fee: item.fee,
    sessionId: item.sessionId,
  }));
}

// ── Sync ──

export async function triggerSync(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await db.triggerSync();
}

export async function triggerFullSync(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await DatabaseModule.triggerFullSync();
}



export async function dumpDatabase(): Promise<string> {
  if (!DatabaseModule) return 'DatabaseModule not available';
  return db.dumpDatabase();
}

export async function clearAllTables(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await db.clearAllTables();
}

export async function deleteSupabaseTable(tableName: string): Promise<boolean> {
  if (!DatabaseModule) return false;
  return db.deleteSupabaseTable(tableName);
}

export async function deleteAllSupabaseTables(): Promise<boolean> {
  if (!DatabaseModule) return false;
  return db.deleteAllSupabaseTables();
}

export async function clearTable(tableName: string): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await db.clearTable(tableName);
}

export async function sendResetCode(email: string): Promise<boolean> {
  if (!DatabaseModule) return false;
  return db.sendResetCode(email);
}

export async function verifyResetCode(email: string, code: string, newPassword: string | null): Promise<boolean> {
  if (!DatabaseModule) return false;
  return db.verifyResetCode(email, code, newPassword || '');
}

// ── Settings ──

const { SettingsModule } = NativeModules;

export async function getSettingBool(key: string): Promise<boolean | null> {
  if (!SettingsModule) return null;
  return SettingsModule.getBool(key);
}

export async function setSettingBool(key: string, value: boolean): Promise<void> {
  if (!SettingsModule) return;
  await SettingsModule.setBool(key, value);
}

export async function getSettingString(key: string): Promise<string | null> {
  if (!SettingsModule) return null;
  return SettingsModule.getString(key);
}

export async function setSettingString(key: string, value: string): Promise<void> {
  if (!SettingsModule) return;
  await SettingsModule.setString(key, value);
}

export async function getSettingInt(key: string): Promise<number | null> {
  if (!SettingsModule) return null;
  const val = await SettingsModule.getString(key);
  if (val === null || val === undefined) return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

export async function setSettingInt(key: string, value: number): Promise<void> {
  if (!SettingsModule) return;
  await SettingsModule.setString(key, String(value));
}

export async function playBeep(volume?: number): Promise<void> {
  if (!SettingsModule) return;
  await SettingsModule.playBeep(volume ?? 80);
}

export async function vibrateDevice(duration?: number): Promise<void> {
  if (!SettingsModule) return;
  await SettingsModule.vibrate(duration || 100);
}

export async function notifySuccess(): Promise<void> {
  try {
    const [vib, dur, snd, vol] = await Promise.all([
      getSettingBool('vibration_enabled'),
      getSettingInt('vibration_duration'),
      getSettingBool('sound_enabled'),
      getSettingInt('sound_volume'),
    ]);
    if (vib !== false) vibrateDevice(dur ?? 100).catch(() => {});
    if (snd !== false) playBeep(vol ?? 80).catch(() => {});
  } catch {}
}
