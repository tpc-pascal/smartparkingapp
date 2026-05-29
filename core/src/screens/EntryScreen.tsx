import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, StatusBar, UIManager, findNodeHandle } from 'react-native';
import LicensePlateCamera from '../components/LicensePlateCamera';

interface ScanScreenProps {
  type: 'Entry' | 'Exit';
  onBack: () => void;
}

function ScanScreen({ type, onBack }: ScanScreenProps) {
  const cameraRef = useRef<any>(null);
  const [plateText, setPlateText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [zoom, setZoom] = useState(1);

  const handleTakeSnapshot = useCallback(() => {
    if (hasSnapshot || isProcessing) return;
    setIsProcessing(true);

    const viewId = findNodeHandle(cameraRef.current);
    if (viewId) {
      UIManager.dispatchViewManagerCommand(
        viewId,
        'takeSnapshot',
        [],
      );
    }
  }, [hasSnapshot, isProcessing]);

  const handleRetake = useCallback(() => {
    setHasSnapshot(false);
    setPlateText('');
    setIsProcessing(false);

    const viewId = findNodeHandle(cameraRef.current);
    if (viewId) {
      UIManager.dispatchViewManagerCommand(
        viewId,
        'resetSnapshot',
        [],
      );
    }
  }, []);

  const handlePlateRecognized = useCallback((event: any) => {
    const { plate, success, error } = event.nativeEvent;
    console.log(`[LPR_JS] handlePlateRecognized: plate='${plate}', success=${success}, error=${error}`);
    setIsProcessing(false);
    setHasSnapshot(true);
    if (success && plate) {
      setPlateText(plate);
    } else {
      console.log(`[LPR_JS] No plate recognized${error ? ': ' + error : ''}`);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (plateText.trim()) {
      const action = type === 'Entry' ? 'xe vào' : 'xe ra';
      console.log(`Đã ghi nhận ${action}: ${plateText}`);
      handleRetake();
    }
  }, [plateText, type, handleRetake]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.5, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.5, 1));
  }, []);

  const title = type === 'Entry' ? 'Quét xe vào' : 'Quét xe ra';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={styles.cameraContainer}>
        <LicensePlateCamera
          ref={cameraRef}
          style={styles.camera}
          zoom={zoom}
          onPlateRecognized={handlePlateRecognized}
        />

        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
            <Text style={styles.zoomText}>+</Text>
          </TouchableOpacity>
          <Text style={styles.zoomLabel}>{zoom.toFixed(1)}x</Text>
          <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
            <Text style={styles.zoomText}>-</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPanel}>
        <Text style={styles.panelTitle}>{title}</Text>

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

        <TouchableOpacity
          style={[
            styles.actionButton,
            isProcessing && styles.buttonDisabled,
            hasSnapshot && styles.retakeButton,
          ]}
          onPress={hasSnapshot ? handleRetake : handleTakeSnapshot}
          disabled={isProcessing}>
          <Text style={styles.actionButtonText}>
            {isProcessing ? 'Đang xử lý...' : hasSnapshot ? 'Thử lại' : 'Chụp ảnh'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.confirmButton, !plateText.trim() && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={!plateText.trim()}>
          <Text style={styles.confirmText}>Xác nhận</Text>
        </TouchableOpacity>
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
  },
  camera: {
    flex: 1,
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    top: '40%',
    alignItems: 'center',
    gap: 8,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
  },
  zoomLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPanel: {
    padding: 24,
    paddingBottom: 40,
    gap: 16,
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
    borderRadius: 16,
    padding: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  actionButton: {
    backgroundColor: '#4A90D9',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  retakeButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.8)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.4)',
  },
  confirmText: {
    color: '#2ECC71',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ScanScreen;
