import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SplashScreen from './src/screens/SplashScreen';
import PermissionScreen from './src/screens/PermissionScreen';
import HomeScreen from './src/screens/HomeScreen';
import EntryScreen from './src/screens/EntryScreen';
import ExitScreen from './src/screens/ExitScreen';

type Screen = 'Splash' | 'Permission' | 'Home' | 'Entry' | 'Exit';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('Splash');
  const appStartTime = Date.now();

  useEffect(() => {
    console.log(`[App] ===== App mounted at ${new Date().toISOString()} =====`);
    console.log(`[App] Initial screen: ${currentScreen}`);
    return () => {
      console.log(`[App] ===== App unmounted (uptime: ${Date.now() - appStartTime}ms) =====`);
    };
  }, []);

  useEffect(() => {
    console.log(`[App] Screen changed to: ${currentScreen} (${Date.now() - appStartTime}ms since start)`);
  }, [currentScreen]);

  function handleSplashFinish() {
    console.log('[App] Splash finished, moving to Permission');
    setCurrentScreen('Permission');
  }

  function handlePermissionGranted() {
    console.log('[App] Permission granted, moving to Home');
    setCurrentScreen('Home');
  }

  function handleNavigate(screen: 'Entry' | 'Exit') {
    console.log(`[App] Navigating to ${screen}`);
    setCurrentScreen(screen);
  }

  function handleBack() {
    console.log('[App] Back to Home');
    setCurrentScreen('Home');
  }

  function renderScreen() {
    switch (currentScreen) {
      case 'Splash':
        return <SplashScreen onFinish={handleSplashFinish} />;
      case 'Permission':
        return <PermissionScreen onPermissionGranted={handlePermissionGranted} />;
      case 'Home':
        return <HomeScreen onNavigate={handleNavigate} />;
      case 'Entry':
        return <EntryScreen type="Entry" onBack={handleBack} />;
      case 'Exit':
        return <ExitScreen type="Exit" onBack={handleBack} />;
      default:
        return <HomeScreen onNavigate={handleNavigate} />;
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {renderScreen()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
});

export default App;
