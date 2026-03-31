import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import GlassCard from '../components/GlassCard';

interface PermissionScreenProps {
  onPermissionGranted: () => void;
}

function PermissionScreen({ onPermissionGranted }: PermissionScreenProps) {
  const { hasPermission, requestPermission } = useCameraPermission();

  React.useEffect(() => {
    console.log('[PERMISSION] PermissionScreen mounted');
    if (hasPermission) {
      console.log('[PERMISSION] Camera permission already granted, skipping');
      onPermissionGranted();
    }
  }, [hasPermission, onPermissionGranted]);

  async function handleGrantPermission() {
    console.log('[PERMISSION] User pressed "Cấp quyền Camera", requesting...');
    const granted = await requestPermission();
    console.log(`[PERMISSION] Permission result: ${granted ? 'GRANTED' : 'DENIED'}`);
    if (granted) {
      onPermissionGranted();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quyền Camera</Text>

      <GlassCard style={styles.card}>
        <Text style={styles.message}>
          SmartParking cần quyền truy cập camera để nhận diện biển số xe một cách chính xác.
        </Text>
      </GlassCard>

      <TouchableOpacity
        style={styles.button}
        onPress={handleGrantPermission}
        activeOpacity={0.7}>
        <Text style={styles.buttonText}>Cấp quyền Camera</Text>
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        Quyền camera chỉ được sử dụng trong ứng dụng và không được chia sẻ.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
  },
  card: {
    marginBottom: 32,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  message: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#4A90D9',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 200,
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 16,
  },
});

export default PermissionScreen;
