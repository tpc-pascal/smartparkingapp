import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import CameraView from '../components/CameraView';
import SnapshotOverlay from '../components/SnapshotOverlay';
import { recognizePlate, BBox } from '../utils/plateHelper';

interface ExitScreenProps {
  type: 'Entry' | 'Exit';
  onBack: () => void;
}

function ExitScreen({ type, onBack }: ExitScreenProps) {
  const cameraRef = useRef<any>(null);
  const [plateText, setPlateText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [capturedImageUri, setCapturedImageUri] = useState<string | undefined>();
  const [plateBbox, setPlateBbox] = useState<BBox | null>(null);

  const handleTakeSnapshot = useCallback(async () => {
    if (hasSnapshot || isProcessing) return;
    setIsProcessing(true);

    try {
      if (!cameraRef.current?.takeSnapshot) {
        setIsProcessing(false);
        return;
      }

      const snapshotUri = await cameraRef.current.takeSnapshot();
      if (!snapshotUri) {
        setIsProcessing(false);
        Alert.alert('Lỗi', 'Không thể chụp ảnh');
        return;
      }

      const uri = `file://${snapshotUri}`;
      setCapturedImageUri(uri);
      setHasSnapshot(true);

      const plateResult = await recognizePlate(snapshotUri);
      if (plateResult.plate && plateResult.plate !== 'unknown') {
        setPlateText(plateResult.plate);
      }
      setPlateBbox(plateResult.bbox);
    } catch {
      Alert.alert('Lỗi', 'Không thể nhận diện biển số');
    } finally {
      setIsProcessing(false);
    }
  }, [hasSnapshot, isProcessing]);

  const handleRetake = useCallback(() => {
    setHasSnapshot(false);
    setCapturedImageUri(undefined);
    setPlateText('');
    setPlateBbox(null);
    setIsProcessing(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!plateText.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập hoặc quét biển số xe');
      return;
    }
    handleRetake();
  }, [plateText, handleRetake]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          active={!hasSnapshot}
        />

        <SnapshotOverlay
          imageUri={capturedImageUri}
          isVisible={hasSnapshot}
          isProcessing={isProcessing}
          bbox={plateBbox}
        />

        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPanel}>
        <Text style={styles.panelTitle}>Quét xe ra</Text>

        <View style={styles.plateRow}>
          <TextInput
            style={styles.plateInput}
            value={plateText}
            onChangeText={setPlateText}
            placeholder="Biển số xe..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="characters"
          />
        </View>

        {hasSnapshot ? (
          <>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={handleRetake}
              activeOpacity={0.7}>
              <Text style={styles.retakeButtonText}>← Thử lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !plateText.trim() && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={!plateText.trim()}
              activeOpacity={0.7}>
              <Text style={styles.confirmText}>Xác nhận</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, isProcessing && styles.buttonDisabled]}
            onPress={handleTakeSnapshot}
            disabled={isProcessing}
            activeOpacity={0.7}>
            <Text style={styles.actionButtonText}>
              {isProcessing ? 'Đang xử lý...' : 'Chụp ảnh'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPanel: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 14,
    backgroundColor: '#0D0D0D',
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  plateInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  actionButton: {
    backgroundColor: '#4A90D9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(46, 204, 113, 0.4)',
  },
  confirmText: {
    color: '#2ECC71',
    fontSize: 15,
    fontWeight: '700',
  },
  retakeButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.85)',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  retakeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ExitScreen;
