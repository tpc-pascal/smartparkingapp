import React, { useEffect, useRef, useCallback } from 'react';
import { AppState, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { SessionProvider } from './src/context/SessionContext';
import { RootStackParamList } from './src/navigation/types';
import RootNavigator from './src/navigation/RootNavigator';
import { triggerSync } from './src/utils/databaseHelper';
import { captureConsole } from './src/utils/consoleCapture';
import { useNetworkStatus } from './src/utils/useNetworkStatus';
import Icon from './src/theme/Icon';

captureConsole();

function AppContent() {
  const { colors } = useTheme();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const appStateRef = useRef(AppState.currentState);
  const { isConnected } = useNetworkStatus();
  const prevConnectedRef = useRef(true);

  useEffect(() => {
    console.log(`[App] ===== App mounted at ${new Date().toISOString()} =====`);
    return () => console.log(`[App] ===== Unmounted =====`);
  }, []);

  const doSync = useCallback(() => {
    triggerSync().catch(() => {});
  }, []);

  useEffect(() => {
    if (prevConnectedRef.current === false && isConnected) {
      console.log('[App] Network reconnected — triggering sync');
      doSync();
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, doSync]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (isConnected) doSync();
        if (appStateRef.current.match(/inactive|background/)) {
          const currentRouteName = navigationRef.current?.getCurrentRoute()?.name;
          if (currentRouteName === 'Entry' || currentRouteName === 'Exit') {
            navigationRef.current?.reset({ index: 0, routes: [{ name: 'Home' }] });
          }
        }
      }
      appStateRef.current = state;
    });
    return () => sub.remove();
  }, [isConnected, doSync]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>

      <TouchableOpacity style={styles.debugFab} activeOpacity={0.6} onPress={() => navigationRef.current?.navigate('Debug')}>
        <Icon name="bug" size={18} color="rgba(255,255,255,0.35)" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
          <AuthProvider>
            <SessionProvider>
              <AppContent />
            </SessionProvider>
          </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  debugFab: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;
