import React from 'react';
import { render, act } from '@testing-library/react-native';
import HomeScreen from '../src/screens/HomeScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  getTodayStats: jest.fn(),
  getCurrentlyParked: jest.fn(),
  isOnline: jest.fn(),
  getRemainingCount: jest.fn(),
}));

const mockLogout = jest.fn();
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    attendantId: 1,
    attendantName: 'test@example.com',
    logout: mockLogout,
  }),
}));

jest.mock('../src/context/SessionContext', () => ({
  useSession: () => ({
    session: mockSession,
    loading: false,
    refresh: jest.fn(),
    createNewSession: jest.fn(),
    endCurrentSession: jest.fn(),
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#1A1D29',
      surface: '#262B38',
      text: '#FFFFFF',
      textSecondary: 'rgba(255,255,255,0.8)',
      textMuted: 'rgba(255,255,255,0.5)',
      primary: '#3B82F6',
      primaryLight: 'rgba(59,130,246,0.2)',
      accent: '#FBBF24',
      accentLight: 'rgba(251,191,36,0.2)',
      danger: '#EF4444',
      dangerLight: 'rgba(239,68,68,0.2)',
      success: '#10B981',
      successLight: 'rgba(16,185,129,0.2)',
      cardBg: '#262B38',
      cardBorder: 'rgba(255,255,255,0.12)',
      border: 'rgba(255,255,255,0.18)',
      borderLight: 'rgba(255,255,255,0.08)',
      statusBar: 'light-content',
    },
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const db = require('../src/utils/databaseHelper');
let mockSession: { id: number; name: string; status: string; createdAt: string } | null = { id: 1, name: 'Phiên 31/05/2026 #1', status: 'active', createdAt: '2026-05-31T10:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { id: 1, name: 'Phiên 31/05/2026 #1', status: 'active', createdAt: '2026-05-31T10:00:00Z' };
  db.getTodayStats.mockResolvedValue({ entryCount: 5, exitCount: 3, parkedCount: 2 });
  db.getCurrentlyParked.mockResolvedValue([
    { id: 1, licensePlate: '59A12345', timeIn: '2026-05-31T10:00:00Z', attendantId: 1 },
  ]);
  db.isOnline.mockResolvedValue(true);
});

it('renders greeting with user name', async () => {
  const { getByText } = render(<HomeScreen />);
  await act(() => Promise.resolve());
  expect(getByText('test')).toBeTruthy();
});

it('renders stats cards with values', async () => {
  const { getByText } = render(<HomeScreen />);
  await act(() => Promise.resolve());
  expect(getByText('5')).toBeTruthy();
  expect(getByText('3')).toBeTruthy();
  expect(getByText('2')).toBeTruthy();
});

it('renders parked vehicle list', async () => {
  const { getByText } = render(<HomeScreen />);
  await act(() => Promise.resolve());
  expect(getByText('59A12345')).toBeTruthy();
});

it('renders action buttons', async () => {
  const { getByText } = render(<HomeScreen />);
  await act(() => Promise.resolve());
  expect(getByText('Quét xe vào')).toBeTruthy();
  expect(getByText('Quét xe ra')).toBeTruthy();
  expect(getByText('Lịch sử')).toBeTruthy();
});

it('shows only create button when no session', async () => {
  mockSession = null;
  const { getByText, queryByText } = render(<HomeScreen />);
  await act(() => Promise.resolve());
  expect(getByText('Tạo phiên')).toBeTruthy();
  expect(queryByText('Quét xe vào')).toBeNull();
  expect(queryByText('Quét xe ra')).toBeNull();
  expect(queryByText('Lịch sử')).toBeNull();
  expect(queryByText('Xe đang trong bãi')).toBeNull();
});
