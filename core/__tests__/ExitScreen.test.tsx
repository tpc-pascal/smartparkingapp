import React from 'react';
import { render } from '@testing-library/react-native';
import ExitScreen from '../src/screens/ExitScreen';

jest.mock('../src/utils/databaseHelper', () => ({
  notifySuccess: jest.fn(),
}));

jest.mock('../src/utils/plateHelper', () => ({
  recognizePlate: jest.fn(),
  isValidVietnamPlate: jest.fn(),
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

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders exit screen title', () => {
  const { getByText } = render(<ExitScreen />);
  expect(getByText('Quét xe ra')).toBeTruthy();
});
