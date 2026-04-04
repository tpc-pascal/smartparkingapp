import React from 'react';
import { render, act } from '@testing-library/react-native';
import DebugScreen from '../src/screens/DebugScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  getDebugLogs: jest.fn(),
  dumpDatabase: jest.fn(),
  clearAllTables: jest.fn(),
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

it('renders log and database tabs', () => {
  const { getByText } = render(<DebugScreen />);
  expect(getByText('Log')).toBeTruthy();
  expect(getByText('SQLite')).toBeTruthy();
});

it('loads logs on mount', async () => {
  render(<DebugScreen />);
  await act(() => Promise.resolve());
  expect(db.getDebugLogs).toHaveBeenCalled();
});
