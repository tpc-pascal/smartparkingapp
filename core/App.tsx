import React, { useState } from 'react';
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

  function handleSplashFinish() {
    setCurrentScreen('Permission');
  }

  function handlePermissionGranted() {
    setCurrentScreen('Home');
  }

  function handleNavigate(screen: 'Entry' | 'Exit') {
    setCurrentScreen(screen);
  }

  function handleBack() {
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
