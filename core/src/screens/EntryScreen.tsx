import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  Alert,
  Animated,
  NativeModules,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import Icon from '../theme/Icon';
import CameraView from '../components/CameraView';
import { recognizePlate, isValidVietnamPlate, plateToBoxes } from '../utils/plateHelper';
import { getSettingBool, notifySuccess } from '../utils/databaseHelper';
import type { Box } from '../components/CameraView';

const SNAP_INTERVAL = 200;

function EntryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cameraRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const dismissedPlatesRef = useRef(new Set<string>());
  const pendingPlateRef = useRef<string | null>(null);
  const showCharBboxesRef = useRef(false);
  const frameCounterRef = useRef(0);

  useEffect(() => {
    (async () => {
      const val = await getSettingBool('show_char_bboxes');
      showCharBboxesRef.current = val === true;
    })();
  }, []);

  const [plateText, setPlateText] = useState('');
  const plateTextRef = useRef(plateText);
  useEffect(() => { plateTextRef.current = plateText; }, [plateText]);
  const [lpdFound, setLpdFound] = useState(false);
  const [manualActive, setManualActive] = useState(false);
  const manualActiveRef = useRef(manualActive);
  useEffect(() => { manualActiveRef.current = manualActive; }, [manualActive]);
  const [elapsed, setElapsed] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [stateBoxes, setStateBoxes] = useState<Box[]>([]);
  const [showPlatePopup, setShowPlatePopup] = useState(false);
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const [showRetryPopup, setShowRetryPopup] = useState(false);
  const retryOpacity = useRef(new Animated.Value(0)).current;
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [pendingNewPlate, setPendingNewPlate] = useState('');
  const updatePopupOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lpdFound) {
      setShowPlatePopup(true);
      Animated.timing(popupOpacity, {
        toValue: 1, duration: 250, useNativeDriver: true,
      }).start();
      const timer = setTimeout(() => {
        Animated.timing(popupOpacity, {
          toValue: 0, duration: 500, useNativeDriver: true,
        }).start(() => setShowPlatePopup(false));
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      popupOpacity.setValue(0);
      setShowPlatePopup(false);
    }
  }, [lpdFound, popupOpacity]);

  useEffect(() => {
    if (showRetryPopup) {
      Animated.timing(retryOpacity, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }).start();
      const timer = setTimeout(() => {
        Animated.timing(retryOpacity, {
          toValue: 0, duration: 400, useNativeDriver: true,
        }).start(() => setShowRetryPopup(false));
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      retryOpacity.setValue(0);
    }
  }, [showRetryPopup, retryOpacity]);

  useEffect(() => {
    if (showUpdatePopup) {
      Animated.timing(updatePopupOpacity, {
        toValue: 1, duration: 250, useNativeDriver: true,
      }).start();
    } else {
      updatePopupOpacity.setValue(0);
    }
  }, [showUpdatePopup, updatePopupOpacity]);

  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setElapsed(0);
    elapsedRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [scanKey]);

  function processResult(plate: string, boxes: Box[], snapPath?: string | null) {
    if (!mountedRef.current) return;
    const hasPlate = !!plate && plate !== 'unknown';
    const detected = hasPlate ? plate.toUpperCase() : '';
    const currentPlateText = plateTextRef.current;
    const currentManualActive = manualActiveRef.current;

    if (currentManualActive) {
      setLpdFound(hasPlate);
      if (!hasPlate) return;
      setStateBoxes(boxes);
      if (snapPath) setCapturedImage(snapPath);
      return;
    }

    if (currentPlateText) {
      setLpdFound(hasPlate);
      if (hasPlate) {
        setStateBoxes(boxes);
        if (snapPath) setCapturedImage(snapPath);
        if (detected !== currentPlateText
          && isValidVietnamPlate(detected)
          && !dismissedPlatesRef.current.has(detected)
          && pendingPlateRef.current !== detected) {
          pendingPlateRef.current = detected;
          setPendingNewPlate(detected);
          setShowUpdatePopup(true);
        }
      } else {
        setPlateText('');
        setStateBoxes([]);
      }
      return;
    }

    setLpdFound(hasPlate);
    if (!hasPlate) return;
    setStateBoxes(boxes);
    if (snapPath) setCapturedImage(snapPath);

    if (!isValidVietnamPlate(detected)) {
      setPlateText(detected);
      return;
    }

    setPlateText(detected);
    notifySuccess().catch(() => {});
  }

  const doRecognize = useCallback(async () => {
    if (processingRef.current || !cameraRef.current?.takeSnapshot) return;
    processingRef.current = true;
    const currentGen = generationRef.current;
    try {
      const snapPath: string | null = await cameraRef.current.takeSnapshot();
      if (!snapPath || !mountedRef.current || currentGen !== generationRef.current) return;
      frameCounterRef.current += 1;
      const frameId = `${Date.now()}_${currentGen}_${frameCounterRef.current}`;
      // Persist frame (unique name) trước khi LPR pipeline xoá file temp
      let framePath = snapPath;
      try {
        const fp = await NativeModules.DatabaseModule.persistFrame(snapPath, frameId);
        if (fp) framePath = fp;
      } catch {}
      const result = await recognizePlate(snapPath);
      if (!mountedRef.current || currentGen !== generationRef.current) return;
      const plates = result.plate && result.plate !== 'unknown' ? result.plate : '';
      const boxes = plateToBoxes(result, showCharBboxesRef.current) as Box[];
      if (plates) {
        // Mark frame valid → rename thành valid_{plate}_{ts}.jpg (unique, không bị overwrite)
        try {
          const validPath = await NativeModules.DatabaseModule.markFrameValid(frameId, plates);
          processResult(plates, boxes, validPath || framePath);
        } catch {
          processResult(plates, boxes, framePath);
        }
      } else {
        NativeModules.DatabaseModule.clearFrame(frameId).catch(() => {});
        processResult(plates, boxes);
      }
    } catch {
    } finally {
      processingRef.current = false;
    }
  }, []);

  useEffect(() => {
    setCapturedImage(null);
    setStateBoxes([]);
    const currentGen = ++generationRef.current;
    const tick = async () => {
      if (!cameraReady) return;
      await doRecognize();
      if (mountedRef.current) timerRef.current = setTimeout(tick, SNAP_INTERVAL);
    };
    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doRecognize, cameraReady, scanKey]);

  const handleRetry = useCallback(() => {
    generationRef.current++;
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    setPlateText('');
    setLpdFound(false);
    setElapsed(0);
    elapsedRef.current = setInterval(() => { setElapsed(prev => prev + 1); }, 1000);
    setScanKey(k => k + 1);
    setCapturedImage(null);
    setStateBoxes([]);
    dismissedPlatesRef.current = new Set();
    pendingPlateRef.current = null;
    setShowRetryPopup(true);
    setShowUpdatePopup(false);
  }, []);

  const handleUpdateAccept = useCallback(() => {
    setPlateText(pendingNewPlate);
    setShowUpdatePopup(false);
    notifySuccess().catch(() => {});
  }, [pendingNewPlate]);

  const handleUpdateDismiss = useCallback(() => {
    if (pendingNewPlate) dismissedPlatesRef.current.add(pendingNewPlate);
    setShowUpdatePopup(false);
  }, [pendingNewPlate]);

  const handleConfirm = useCallback(async () => {
    const p = plateText.trim().toUpperCase();
    if (!isValidVietnamPlate(p)) { Alert.alert('Thông báo', 'Biển số không hợp lệ'); return; }
    const img = capturedImage;
    setPlateText('');
    setLpdFound(false);
    setCapturedImage(null);
    setStateBoxes([]);
    setShowUpdatePopup(false);
    pendingPlateRef.current = null;
    dismissedPlatesRef.current = new Set();
    generationRef.current++;
    navigation.navigate('NfcEntry', { plateText: p, mode: 'write', imageUri: img || undefined });
  }, [plateText, capturedImage, navigation]);

  const plateValid = isValidVietnamPlate(plateText);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} active={true} onCameraReady={() => setCameraReady(true)} boxes={stateBoxes} />
        <TouchableOpacity style={styles.backBtnOverlay} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.timerOverlay}>
          <Text style={styles.timerText}>{elapsed}s</Text>
        </View>
        {showPlatePopup && (
          <Animated.View style={[styles.platePopup, { opacity: popupOpacity }]}>
            <Icon name="check" size={16} color="#FFFFFF" />
            <Text style={styles.platePopupText}>Đã nhận diện</Text>
          </Animated.View>
        )}
        {showRetryPopup && (
          <Animated.View style={[styles.retryPopup, { opacity: retryOpacity }]}>
            <Icon name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.platePopupText}>Đang nhận diện lại...</Text>
          </Animated.View>
        )}
        {showUpdatePopup && (
          <Animated.View style={[styles.updatePopup, { opacity: updatePopupOpacity }]}>
            <Text style={styles.updatePopupTitle}>Phát hiện biển số mới</Text>
            <Text style={styles.updatePopupPlate}>{pendingNewPlate}</Text>
            <View style={styles.updatePopupActions}>
              <TouchableOpacity style={styles.updateBtn} onPress={handleUpdateDismiss}>
                <Text style={styles.updateBtnText}>Bỏ qua</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.updateBtn, styles.updateBtnAccept]} onPress={handleUpdateAccept}>
                <Text style={styles.updateBtnText}>Cập nhật</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
      <View style={[styles.bottomPanel, { backgroundColor: colors.surface }]}>
        <View style={[styles.panelHandle, { backgroundColor: colors.border }]} />
        <Text style={[styles.panelTitle, { color: colors.text }]}>
          Quét xe vào
        </Text>
        <View style={[styles.plateInput, { borderColor: colors.inputBorder }]}>
          <Icon name="camera" size={20} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[styles.plateTextInput, { color: colors.text }]}
            value={lpdFound && !plateText ? `Đang nhận diện... (${elapsed}s)` : plateText}
            onChangeText={setPlateText}
            placeholder=""
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            editable={manualActive}
          />
          {!!plateText && (
            <TouchableOpacity onPress={() => {
              if (manualActive) {
                setManualActive(false);
                inputRef.current?.blur();
              } else {
                setManualActive(true);
                setTimeout(() => {
                  inputRef.current?.focus();
                  inputRef.current?.setNativeProps({
                    selection: { start: plateText.length, end: plateText.length },
                  });
                }, 100);
              }
            }}>
              <Icon name="pencil" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.confirmBtn, !plateValid && styles.disabled]}
            onPress={handleConfirm}
            disabled={!plateValid}
            activeOpacity={0.7}
          >
            <Icon name="check" size={20} color="#FFFFFF" />
            <Text style={styles.confirmText}>Xác nhận</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRetry}
            activeOpacity={0.7}
          >
            <Icon name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.confirmText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  backBtnOverlay: {
    position: 'absolute', top: 16, left: 16,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
  },
  timerOverlay: {
    position: 'absolute', top: 16, left: 68,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  timerText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  bottomPanel: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    gap: 14,
  },
  panelHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  panelTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  plateInput: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14,
  },
  plateTextInput: { flex: 1, paddingVertical: 12, fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: 2 },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(5,150,105,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  retryBtn: {
    flex: 1,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  disabled: { opacity: 0.5 },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  platePopup: {
    position: 'absolute', top: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(5,150,105,0.9)',
    zIndex: 20,
  },
  platePopupText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  retryPopup: {
    position: 'absolute', top: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.9)',
    zIndex: 20,
  },
  updatePopup: {
    position: 'absolute', top: 60, right: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(30,30,40,0.95)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 30,
    minWidth: 180,
    alignItems: 'center',
    gap: 6,
  },
  updatePopupTitle: { color: '#eab308', fontSize: 12, fontWeight: '600' },
  updatePopupPlate: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  updatePopupActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  updateBtn: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  updateBtnAccept: { backgroundColor: 'rgba(5,150,105,0.9)' },
  updateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});

export default EntryScreen;
