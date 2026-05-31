import React, { forwardRef, useImperativeHandle, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

interface CameraViewProps {
  style?: any;
  active?: boolean;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onError?: (error: string) => void;
  onCameraReady?: () => void;
}

const CameraView = forwardRef<any, CameraViewProps>(({
  style,
  active = true,
  zoom = 1,
  onZoomChange,
  onError,
  onCameraReady,
}, ref) => {
  const cameraRef = React.useRef<Camera>(null);
  const device = useCameraDevice('back');

  const takeSnapshot = useCallback(async (): Promise<string | null> => {
    try {
      if (!cameraRef.current) {
        console.warn('[CAMERA] takeSnapshot: camera not ready');
        return null;
      }
      const photo = await cameraRef.current.takeSnapshot({
        quality: 90,
      });
      return photo.path;
    } catch (error) {
      console.error('[CAMERA] takeSnapshot error:', error);
      return null;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    takeSnapshot,
  }), [takeSnapshot]);

  if (!device) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorBox}>
          {/* Camera device not available */}
        </View>
      </View>
    );
  }

  return (
    <Camera
      ref={cameraRef}
      style={[styles.camera, style]}
      device={device}
      isActive={active}
      photo={false}
      onInitialized={onCameraReady}
      onError={(err) => onError?.(err.message)}
    />
  );
});

CameraView.displayName = 'CameraView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  errorBox: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
});

export default CameraView;
