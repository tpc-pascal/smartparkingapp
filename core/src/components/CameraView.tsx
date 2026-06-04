import React, { forwardRef, useImperativeHandle, useCallback, useState } from 'react';
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

const RETRY_COUNT = 3;
const RETRY_DELAY = 200;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  const [cameraReady, setCameraReady] = useState(false);

  const takeSnapshot = useCallback(async (): Promise<string | null> => {
    for (let i = 0; i < RETRY_COUNT; i++) {
      try {
        if (!cameraRef.current) {
          if (i < RETRY_COUNT - 1) { await delay(RETRY_DELAY); continue; }
          return null;
        }
        const photo = await cameraRef.current.takeSnapshot({ quality: 90 });
        return photo.path;
      } catch {
        if (i < RETRY_COUNT - 1) { await delay(RETRY_DELAY); continue; }
        return null;
      }
    }
    return null;
  }, []);

  useImperativeHandle(ref, () => ({
    takeSnapshot,
    cameraReady,
  }), [takeSnapshot, cameraReady]);

  if (!device) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorBox} />
      </View>
    );
  }

  return (
    <Camera
      ref={cameraRef}
      style={[styles.camera, style]}
      device={device}
      isActive={active}
      video={true}
      photo={false}
      onInitialized={() => { setCameraReady(true); onCameraReady?.(); }}
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
