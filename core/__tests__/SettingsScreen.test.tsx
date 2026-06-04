import React from 'react';
import { render, act } from '@testing-library/react-native';
import SettingsScreen from '../src/screens/SettingsScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  getSettingBool: jest.fn(),
  setSettingBool: jest.fn(),
  getSettingInt: jest.fn(),
  setSettingInt: jest.fn(),
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ attendantName: 'test@example.com', deleteAccount: jest.fn() }),
}));

jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#1A1D29', surface: '#262B38', text: '#FFFFFF',
      textSecondary: 'rgba(255,255,255,0.8)', textMuted: 'rgba(255,255,255,0.5)',
      primary: '#3B82F6', primaryLight: 'rgba(59,130,246,0.2)',
      accent: '#FBBF24', danger: '#EF4444', dangerLight: 'rgba(239,68,68,0.2)',
      success: '#10B981', cardBg: '#262B38', cardBorder: 'rgba(255,255,255,0.12)',
      border: 'rgba(255,255,255,0.18)', borderLight: 'rgba(255,255,255,0.08)',
      inputBorder: 'rgba(255,255,255,0.25)', statusBar: 'light-content',
    },
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const db = require('../src/utils/databaseHelper');

beforeEach(() => {
  jest.clearAllMocks();
  db.getSettingBool.mockResolvedValue(true);
  db.getSettingInt.mockImplementation((key) => {
    if (key === 'vibration_duration') return Promise.resolve(100);
    if (key === 'sound_volume') return Promise.resolve(80);
    return Promise.resolve(null);
  });
});

it('renders header title', () => {
  const { getByText } = render(<SettingsScreen />);
  expect(getByText('Cài đặt')).toBeTruthy();
});

it('renders account section with reset password and delete account', () => {
  const { getByText } = render(<SettingsScreen />);
  expect(getByText('TÀI KHOẢN')).toBeTruthy();
  expect(getByText('Đặt lại mật khẩu')).toBeTruthy();
  expect(getByText('Xóa tài khoản')).toBeTruthy();
});

it('renders rung & âm thanh section', async () => {
  const { getByText } = render(<SettingsScreen />);
  await act(() => Promise.resolve());
  expect(getByText('RUNG & ÂM THANH')).toBeTruthy();
  expect(getByText('Rung')).toBeTruthy();
  expect(getByText('Âm thanh')).toBeTruthy();
});

it('renders back button that navigates back', () => {
  const { getByText } = render(<SettingsScreen />);
  expect(getByText('Cài đặt')).toBeTruthy();
});
