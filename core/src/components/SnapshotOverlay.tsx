import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  Text,
  LayoutChangeEvent,
} from 'react-native';
import { BBox } from '../utils/plateHelper';

export interface SnapshotOverlayProps {
  imageUri?: string;
  isVisible: boolean;
  isProcessing: boolean;
  bbox?: BBox | null;
}

const SnapshotOverlay = React.forwardRef<any, SnapshotOverlayProps>(({
  imageUri,
  isVisible,
  isProcessing,
  bbox,
}, ref) => {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });

  if (!isVisible) return null;

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ w: width, h: height });
  };

  const handleImageLoad = (e: any) => {
    const { width, height } = e.nativeEvent.source;
    setImageSize({ w: width, h: height });
  };

  const renderBbox = () => {
    if (!bbox || containerSize.w === 0 || containerSize.h === 0 || imageSize.w === 0 || imageSize.h === 0) return null;

    const imgAspect = imageSize.w / imageSize.h;
    const contAspect = containerSize.w / containerSize.h;

    let displayW: number, displayH: number;
    let offsetX = 0, offsetY = 0;

    if (imgAspect > contAspect) {
      displayW = containerSize.w;
      displayH = containerSize.w / imgAspect;
      offsetY = (containerSize.h - displayH) / 2;
    } else {
      displayH = containerSize.h;
      displayW = containerSize.h * imgAspect;
      offsetX = (containerSize.w - displayW) / 2;
    }

    const scale = displayW / imageSize.w;

    const left = offsetX + bbox.x1 * scale;
    const top = offsetY + bbox.y1 * scale;
    const bw = (bbox.x2 - bbox.x1) * scale;
    const bh = (bbox.y2 - bbox.y1) * scale;

    return (
      <View
        pointerEvents="none"
        style={[
          styles.bbox,
          {
            left,
            top,
            width: bw,
            height: bh,
          },
        ]}
      />
    );
  };

  return (
    <View style={styles.overlay} onLayout={handleLayout}>
      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="contain"
          onLoad={handleImageLoad}
        />
      )}
      {renderBbox()}
      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4A90D9" />
          <Text style={styles.loadingText}>Đang xử lý...</Text>
        </View>
      )}
    </View>
  );
});

SnapshotOverlay.displayName = 'SnapshotOverlay';

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bbox: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#00FF00',
    borderRadius: 4,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 10,
    fontWeight: '500',
  },
});

export default SnapshotOverlay;
