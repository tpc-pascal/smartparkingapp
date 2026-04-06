import React from 'react';
import { render, act } from '@testing-library/react-native';
import DebugScreen from '../src/screens/DebugScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  getDebugLogs: jest.fn(),
  dumpDatabase: jest.fn(),
  clearAllTables: jest.fn(),
  fetchSupabaseTable: jest.fn(),
  triggerSync: jest.fn(),
  executeSql: jest.fn(),
  deleteSupabaseTable: jest.fn(),
  deleteAllSupabaseTables: jest.fn(),
  clearTable: jest.fn(),
}));

jest.mock('../src/utils/consoleCapture', () => ({
  getCapturedLogs: jest.fn(() => []),
}));

jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: { primary: '#3B82F6' },
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native/Libraries/Components/Clipboard/Clipboard', () => ({
  setString: jest.fn(),
}));

const db = require('../src/utils/databaseHelper');

beforeEach(() => {
  jest.clearAllMocks();
  db.getDebugLogs.mockResolvedValue(['log1', 'log2']);
  db.dumpDatabase.mockResolvedValue('db dump content');
});

it('renders debug title', () => {
  const { getByText } = render(<DebugScreen />);
  expect(getByText('Debug')).toBeTruthy();
});

it('renders log and tabs', () => {
  const { getByText } = render(<DebugScreen />);
  expect(getByText('Log')).toBeTruthy();
  expect(getByText('Server')).toBeTruthy();
});

it('loads logs on mount', async () => {
  render(<DebugScreen />);
  await act(() => Promise.resolve());
  expect(db.getDebugLogs).toHaveBeenCalled();
});
