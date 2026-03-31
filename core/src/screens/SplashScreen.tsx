import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SplashScreenProps {
  onFinish: () => void;
}

function SplashScreen({ onFinish }: SplashScreenProps) {
  useEffect(() => {
    console.log('[SPLASH] SplashScreen mounted, starting 2s timer');
    const timer = setTimeout(() => {
      console.log('[SPLASH] 2s timer finished, calling onFinish');
      onFinish();
    }, 2000);
    return () => {
      console.log('[SPLASH] SplashScreen unmounted / cleanup');
      clearTimeout(timer);
    };
  }, [onFinish]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🚗</Text>
      <Text style={styles.title}>SmartParking</Text>
      <Text style={styles.subtitle}>Nhận diện biển số xe</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 8,
  },
});

export default SplashScreen;
