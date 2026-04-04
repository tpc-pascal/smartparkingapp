import React, { createContext, useContext, useMemo } from 'react';
import { StatusBar } from 'react-native';
import { darkColors, ThemeColors } from './colors';

interface ThemeContextValue {
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colors = darkColors;
  const value = useMemo(() => ({ colors }), []);
  return (
    <ThemeContext.Provider value={value}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
