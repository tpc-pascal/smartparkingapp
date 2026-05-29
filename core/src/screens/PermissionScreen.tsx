import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, Linking } from 'react-native';
import GlassCard from '../components/GlassCard';

interface PermissionScreenProps {
  onPermissionGranted: () => void;
}

async function requestCameraPermission(): Promise<boolean> {
  try {
    const PermissionsAndroid = require('react-native').PermissionsAndroid;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Quyền truy cập Camera',
        message: 'SmartParking cần quyền truy cập camera để nhận diện biển số xe.',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Từ chối',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    return false;
  }
}

function PermissionScreen({ onPermissionGranted }: PermissionScreenProps) {
  useEffect(() => {
    checkExistingPermission();
  }, []);

  async function checkExistingPermission() {
    try {
      const { PermissionsAndroid, Platform } = require('react-native');
      if (Platform.OS === 'android') {
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        if (hasPermission) {
          onPermissionGranted();
        }
      }
    } catch (e) {
      // ignore
    }
  }

  async function handleGrantPermission() {
    const granted = await requestCameraPermission();
    if (granted) {
      onPermissionGranted();
    } else {
      Alert.alert(
        'Cần quyền Camera',
        'Vui lòng cấp quyền camera trong Cài đặt để sử dụng ứng dụng.',
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
        ],
      );
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📷</Text>
      <Text style={styles.title}>Quyền Camera</Text>
      <GlassCard style={styles.card}>
        <Text style={styles.message}>
          SmartParking cần quyền truy cập camera sau để nhận diện biển số xe.
        </Text>
      </GlassCard>
      <TouchableOpacity style={styles.button} onPress={handleGrantPermission}>
        <Text style={styles.buttonText}>Cấp quyền Camera</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  card: {
    width: '100%',
    marginBottom: 32,
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#4A90D9',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default PermissionScreen;
