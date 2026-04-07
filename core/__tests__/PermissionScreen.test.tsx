import React from 'react';
import { render, act } from '@testing-library/react-native';
import PermissionScreen from '../src/screens/PermissionScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  setSettingBool: jest.fn(),
  getSession: jest.fn(),
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() }),
}));

jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#1A1D29', text: '#FFFFFF',
      textSecondary: 'rgba(255,255,255,0.8)', textMuted: 'rgba(255,255,255,0.5)',
      primary: '#3B82F6', accent: '#FBBF24', success: '#10B981',
    },
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders title and subtitle', () => {
  const { getByText } = render(<PermissionScreen />);
  expect(getByText('Yêu cầu thiết lập')).toBeTruthy();
  expect(getByText('Vui lòng cấp quyền camera để tiếp tục')).toBeTruthy();
});

it('renders camera card only', () => {
  const { getByText, queryByText } = render(<PermissionScreen />);
  expect(getByText('Camera')).toBeTruthy();
  expect(queryByText('Mạng')).toBeNull();
});
