import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ResetPasswordScreen from '../src/screens/ResetPasswordScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  sendResetCode: jest.fn(),
  verifyResetCode: jest.fn(),
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
  global.__mockRouteParams.initialEmail = 'test@example.com';
});

it('renders step 1 with send code button', () => {
  const { getByText } = render(<ResetPasswordScreen />);
  expect(getByText('Quên mật khẩu')).toBeTruthy();
  expect(getByText('Gửi mã')).toBeTruthy();
});

it('renders email input with initial value', () => {
  const { getByDisplayValue } = render(<ResetPasswordScreen />);
  expect(getByDisplayValue('test@example.com')).toBeTruthy();
});

it('calls sendResetCode on submit', async () => {
  db.sendResetCode.mockResolvedValue(undefined);
  const { getByText } = render(<ResetPasswordScreen />);
  await act(async () => {
    fireEvent.press(getByText('Gửi mã'));
  });
  expect(db.sendResetCode).toHaveBeenCalledWith('test@example.com');
});
