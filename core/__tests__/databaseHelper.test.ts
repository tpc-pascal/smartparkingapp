import { NativeModules } from 'react-native';

beforeEach(() => {
  jest.resetModules();
  NativeModules.DatabaseModule = {
    checkEmail: jest.fn().mockResolvedValue(true),
    getSession: jest.fn().mockResolvedValue({ id: 1, fullName: 'Test User' }),
    verifySessionOnSupabase: jest.fn().mockResolvedValue(true),
    isOnline: jest.fn().mockResolvedValue(true),
    logout: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    recordEntry: jest.fn().mockResolvedValue({ id: 42 }),
    getTodayStats: jest.fn().mockResolvedValue({ entryCount: 5, exitCount: 3, parkedCount: 2 }),
    searchParkingLogs: jest.fn().mockResolvedValue([]),
    getCurrentlyParked: jest.fn().mockResolvedValue([]),
  };
  NativeModules.SettingsModule = {
    getBool: jest.fn().mockResolvedValue(true),
    setBool: jest.fn().mockResolvedValue(undefined),
    getString: jest.fn().mockResolvedValue('100'),
    setString: jest.fn().mockResolvedValue(undefined),
    playBeep: jest.fn().mockResolvedValue(undefined),
    vibrate: jest.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => {
  delete NativeModules.DatabaseModule;
  delete NativeModules.SettingsModule;
});

describe('databaseHelper', () => {
  it('checkEmail delegates to DatabaseModule', async () => {
    const { checkEmail } = require('../src/utils/databaseHelper');
    const result = await checkEmail('test@example.com');
    expect(result).toBe(true);
    expect(NativeModules.DatabaseModule.checkEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('getSession returns parsed result', async () => {
    const { getSession } = require('../src/utils/databaseHelper');
    const session = await getSession();
    expect(session).toEqual({ id: 1, fullName: 'Test User' });
  });

  it('getSession returns null when module returns null', async () => {
    NativeModules.DatabaseModule.getSession.mockResolvedValue(null);
    const { getSession } = require('../src/utils/databaseHelper');
    const session = await getSession();
    expect(session).toBeNull();
  });

  it('recordEntry returns id', async () => {
    const { recordEntry } = require('../src/utils/databaseHelper');
    const id = await recordEntry('59A12345', 1);
    expect(id).toBe(42);
  });

  it('getTodayStats returns parsed stats', async () => {
    const { getTodayStats } = require('../src/utils/databaseHelper');
    const stats = await getTodayStats();
    expect(stats).toEqual({ entryCount: 5, exitCount: 3, parkedCount: 2 });
  });

  it('isOnline works when DatabaseModule exists', async () => {
    const { isOnline } = require('../src/utils/databaseHelper');
    const result = await isOnline();
    expect(result).toBe(true);
    expect(NativeModules.DatabaseModule.isOnline).toHaveBeenCalled();
  });

  it('getSettingBool returns value from SettingsModule', async () => {
    const { getSettingBool } = require('../src/utils/databaseHelper');
    const result = await getSettingBool('vibration_enabled');
    expect(result).toBe(true);
  });

  it('getSettingInt parses string to int', async () => {
    const { getSettingInt } = require('../src/utils/databaseHelper');
    const result = await getSettingInt('sound_volume');
    expect(result).toBe(100);
  });

  it('getSettingInt returns null for non-numeric string', async () => {
    NativeModules.SettingsModule.getString.mockResolvedValue('abc');
    const { getSettingInt } = require('../src/utils/databaseHelper');
    const result = await getSettingInt('sound_volume');
    expect(result).toBeNull();
  });
});
