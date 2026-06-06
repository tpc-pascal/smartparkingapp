import React, { forwardRef, useImperativeHandle, useCallback, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

interface CameraViewProps {
  style?: any;
  active?: boolean;
  zoom?: number;
  onError?: (error: string) => void;
  onCameraReady?: () => void;
  boxes?: Box[];
}

const RETRY_COUNT = 3;
const RETRY_DELAY = 200;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ms));
}

const CameraView = forwardRef<any, CameraViewProps>(({
  style,
  active = true,
  zoom = 1,
  onError,
  onCameraReady,
  boxes,
}, ref) => {
  const cameraRef = React.useRef<Camera>(null);
  const device = useCameraDevice('back');
  const [cameraReady, setCameraReady] = useState(false);

  const takeSnapshot = useCallback(async (): Promise<string | null> => {
    for (let i = 0; i < RETRY_COUNT; i++) {
      try {
        if (!cameraRef.current) {
          console.log('[CameraView] takeSnapshot skip — cameraRef null (attempt', i + 1, ')');
          if (i < RETRY_COUNT - 1) { await delay(RETRY_DELAY); continue; }
          return null;
        }
        const photo = await cameraRef.current.takeSnapshot({ quality: 40 });
        console.log('[CameraView] takeSnapshot OK:', photo.path);
        return photo.path;
      } catch {
        console.warn('[CameraView] takeSnapshot fail (attempt', i + 1, ')');
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

  const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];

  return (
    <View style={[styles.container, style]}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={active}
        video={true}
        photo={true}
        onInitialized={() => { setCameraReady(true); onCameraReady?.(); }}
        onError={(err) => onError?.(err.message)}
      />
      {boxes?.map((box, i) => {
        const isPlate = !!box.label;
        const color = isPlate ? '#22c55e' : COLORS[i % COLORS.length];
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              zIndex: 10,
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              borderWidth: isPlate ? 2 : 1,
              borderColor: color,
              backgroundColor: `${color}33`,
              borderRadius: 2,
            }}
          >
            {isPlate && (
              <View style={[styles.bboxLabelWrap, { backgroundColor: color }]}>
                <Text style={styles.bboxLabel}>{box.label}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
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
  bboxLabelWrap: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    backgroundColor: '#10b981',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  bboxLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default CameraView;
