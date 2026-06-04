export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  danger: string;
  dangerLight: string;
  success: string;
  successLight: string;
  warning: string;
  border: string;
  borderLight: string;
  inputBg: string;
  inputBorder: string;
  cardBg: string;
  cardBorder: string;
  statusBar: 'light-content' | 'dark-content';
}

export const darkColors: ThemeColors = {
  background: '#1A1D29',
  surface: '#262B38',
  surfaceElevated: '#2F3545',
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
  warning: '#F59E0B',
  border: 'rgba(255,255,255,0.18)',
  borderLight: 'rgba(255,255,255,0.08)',
  inputBg: '#2F3545',
  inputBorder: 'rgba(255,255,255,0.25)',
  cardBg: '#262B38',
  cardBorder: 'rgba(255,255,255,0.12)',
  statusBar: 'light-content',
};
