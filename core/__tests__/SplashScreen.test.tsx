import React from 'react';
import { render, act } from '@testing-library/react-native';
import SplashScreen from '../src/screens/SplashScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  getSettingBool: jest.fn(),
  getSession: jest.fn(),
  verifySessionOnSupabase: jest.fn(),
  logout: jest.fn(),
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn(), attendantId: 0, attendantName: '' }),
}));

jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      text: '#fff',
      textSecondary: '#999',
      primary: '#3B82F6',
    },
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const db = require('../src/utils/databaseHelper');

function flushPromises() {
  return act(() => Promise.resolve());
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders splash screen with logo, title, and loader', () => {
  db.getSettingBool.mockResolvedValue(true);
  db.getSession.mockResolvedValue(null);
  const { getByText } = render(<SplashScreen />);
  expect(getByText('s.p.a')).toBeTruthy();
  expect(getByText('Nhận diện biển số xe')).toBeTruthy();
});

it('redirects to Home when session is valid', async () => {
  db.getSettingBool.mockResolvedValue(true);
  db.getSession.mockResolvedValue({ id: 1, fullName: 'Test User' });
  db.verifySessionOnSupabase.mockResolvedValue(true);
  render(<SplashScreen />);
  await flushPromises();
  expect(global.__mockReplace).toHaveBeenCalledWith('Home');
});

it('redirects to Login when no session', async () => {
  db.getSettingBool.mockResolvedValue(true);
  db.getSession.mockResolvedValue(null);
  render(<SplashScreen />);
  await flushPromises();
  expect(global.__mockReplace).toHaveBeenCalledWith('Login');
});

it('redirects to Permission when permissions not granted', async () => {
  db.getSettingBool.mockResolvedValue(false);
  render(<SplashScreen />);
  await flushPromises();
  expect(global.__mockReplace).toHaveBeenCalledWith('Permission');
});

it('redirects to Login on any error', async () => {
  db.getSettingBool.mockRejectedValue(new Error('fail'));
  render(<SplashScreen />);
  await flushPromises();
  expect(global.__mockReplace).toHaveBeenCalledWith('Login');
});
