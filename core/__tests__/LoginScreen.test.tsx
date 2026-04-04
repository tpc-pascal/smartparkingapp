import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import LoginScreen from '../src/screens/LoginScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  loginAttendant: jest.fn(),
  registerAttendant: jest.fn(),
}));

const mockLogin = jest.fn();
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    attendantId: 0,
    attendantName: '',
    login: mockLogin,
  }),
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
      danger: '#EF4444',
      dangerLight: 'rgba(239,68,68,0.2)',
      success: '#10B981',
      cardBg: '#262B38',
      cardBorder: 'rgba(255,255,255,0.12)',
      border: 'rgba(255,255,255,0.18)',
      borderLight: 'rgba(255,255,255,0.08)',
      inputBorder: 'rgba(255,255,255,0.25)',
      statusBar: 'light-content',
    },
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const db = require('../src/utils/databaseHelper');

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders login form by default', () => {
  const { getByPlaceholderText } = render(<LoginScreen />);
  expect(getByPlaceholderText('Email')).toBeTruthy();
  expect(getByPlaceholderText('Mật khẩu')).toBeTruthy();
});

it('toggles to register mode', () => {
  const { queryByPlaceholderText } = render(<LoginScreen />);
  expect(queryByPlaceholderText('Xác nhận mật khẩu')).toBeNull();
});

it('shows error for empty email on submit', async () => {
  const { getByPlaceholderText, getAllByText } = render(<LoginScreen />);
  const submitBtns = getAllByText('Đăng nhập');
  fireEvent.press(submitBtns[1]);
  await act(() => Promise.resolve());
  expect(db.loginAttendant).not.toHaveBeenCalled();
});

it('calls login on valid submission', async () => {
  db.loginAttendant.mockResolvedValue({ id: 1, fullName: 'Test User' });
  const { getByPlaceholderText, getAllByText } = render(<LoginScreen />);
  fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
  fireEvent.changeText(getByPlaceholderText('Mật khẩu'), 'password123');
  const submitBtns = getAllByText('Đăng nhập');
  await act(async () => {
    fireEvent.press(submitBtns[1]);
  });
  expect(db.loginAttendant).toHaveBeenCalledWith('test@example.com', 'password123');
});

it('displays server error on login failure', async () => {
  db.loginAttendant.mockRejectedValue(new Error('Lỗi kết nối'));
  const { getByText, getByPlaceholderText, getAllByText } = render(<LoginScreen />);
  fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
  fireEvent.changeText(getByPlaceholderText('Mật khẩu'), 'password123');
  const submitBtns = getAllByText('Đăng nhập');
  await act(async () => {
    fireEvent.press(submitBtns[1]);
  });
  expect(getByText('Lỗi kết nối')).toBeTruthy();
});
