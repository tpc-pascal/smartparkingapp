import { NativeModules } from 'react-native';

const { DatabaseModule } = NativeModules;

export async function checkEmail(email: string): Promise<boolean> {
  if (!DatabaseModule) return false;
  return DatabaseModule.checkEmail(email);
}

export async function getDebugLogs(count?: number): Promise<string[]> {
  if (!DatabaseModule) return [];
  return DatabaseModule.getDebugLogs(count || 100);
}

export async function isOnline(): Promise<boolean> {
  if (!DatabaseModule) return false;
  return DatabaseModule.isOnline();
}

// ── Types ──

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

// ── Attendant ──

export async function getAttendantById(id: number): Promise<AttendantDetail> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.getAttendantById(id);
  return { id: result.id, fullName: result.fullName, email: result.email, isSynced: result.isSynced };
}

export async function registerAttendant(email: string, password: string): Promise<AttendantResult> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.registerAttendant(email, password);
  return { id: result.id, fullName: result.fullName };
}

export async function loginAttendant(email: string, password: string): Promise<AttendantResult> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.loginAttendant(email, password);
  return { id: result.id, fullName: result.fullName };
}

// ── Session ──

// ── Session ──

export async function getActiveSession(): Promise<SessionInfo | null> {
  if (!DatabaseModule) return null;
  const result: any = await DatabaseModule.getActiveSession();
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
  const result: any = await DatabaseModule.createSession(name);
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
  return createSession();
}

export async function endSession(sessionId: number): Promise<{ ended: boolean; remaining: number }> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.endSession(sessionId);
  return { ended: result.ended, remaining: result.remaining };
}

export async function getRemainingCount(sessionId: number): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  return DatabaseModule.getRemainingCount(sessionId);
}

export async function getSession(): Promise<AttendantResult | null> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.getSession();
  return result ? { id: result.id, fullName: result.fullName } : null;
}

export async function executeSql(sql: string): Promise<any[]> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  return DatabaseModule.executeSql(sql);
}

export async function verifySessionOnSupabase(): Promise<boolean> {
  if (!DatabaseModule) return false;
  return DatabaseModule.verifySessionOnSupabase();
}

export async function logout(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await DatabaseModule.logout();
}

export async function deleteAccount(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await DatabaseModule.deleteAccount();
}

// ── Parking Entry / Exit ──

export async function recordEntry(licensePlate: string, sessionId: number): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.recordEntry(licensePlate, sessionId);
  return result.id;
}

export async function recordEntryFull(
  licensePlate: string,
  timestamp: string,
  entryImage?: string,
  sessionId?: number,
): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.recordEntryFull(
    licensePlate, timestamp, entryImage || null, sessionId || 0
  );
  return result.id;
}

export async function recordEntryWithTimestamp(licensePlate: string, sessionId: number, timestamp: string): Promise<number> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.recordEntryWithTimestamp(licensePlate, sessionId, timestamp);
  return result.id;
}

export async function recordExit(licensePlate: string): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await DatabaseModule.recordExit(licensePlate);
}

export async function recordExitFull(licensePlate: string, exitImage?: string): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await DatabaseModule.recordExitFull(licensePlate, exitImage || null);
}

// ── Queries ──

export async function getCurrentlyParked(): Promise<ParkingLogResult[]> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const array: any[] = await DatabaseModule.getCurrentlyParked();
  return array.map((item: any) => ({
    id: item.id,
    licensePlate: item.licensePlate,
    timeIn: item.timeIn,
    sessionId: item.sessionId,
    entryImage: item.entryImage,
  }));
}

export async function getTodayStats(): Promise<TodayStats> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const result: any = await DatabaseModule.getTodayStats();
  return { entryCount: result.entryCount, exitCount: result.exitCount, parkedCount: result.parkedCount };
}

export async function searchParkingLogs(
  query?: string,
  onlyParked?: boolean,
  offset?: number,
  limit?: number,
): Promise<ParkingLogResult[]> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  const parkedStr = onlyParked ? 'true' : null;
  const array: any[] = await DatabaseModule.searchParkingLogs(query || null, parkedStr, offset || 0, limit || 50);
  return array.map((item: any) => ({
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
  await DatabaseModule.triggerSync();
}

export async function dumpDatabase(): Promise<string> {
  if (!DatabaseModule) return 'DatabaseModule not available';
  return DatabaseModule.dumpDatabase();
}

export async function clearAllTables(): Promise<void> {
  if (!DatabaseModule) throw new Error('DatabaseModule not available');
  await DatabaseModule.clearAllTables();
}

export async function sendResetCode(email: string): Promise<boolean> {
  if (!DatabaseModule) return false;
  return DatabaseModule.sendResetCode(email);
}

export async function verifyResetCode(email: string, code: string, newPassword: string | null): Promise<boolean> {
  if (!DatabaseModule) return false;
  return DatabaseModule.verifyResetCode(email, code, newPassword || '');
}

// ── Settings ──

const { SettingsModule } = NativeModules;

export async function getSettingBool(key: string): Promise<boolean> {
  if (!SettingsModule) return false;
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
