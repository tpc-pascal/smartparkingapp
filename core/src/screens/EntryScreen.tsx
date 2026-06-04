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
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import Icon from '../theme/Icon';
import CameraView from '../components/CameraView';
import { recognizePlate, isValidVietnamPlate } from '../utils/plateHelper';
import { notifySuccess } from '../utils/databaseHelper';

const SNAP_INTERVAL = 400;

function EntryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cameraRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const doneRef = useRef(false);

  const [plateText, setPlateText] = useState('');
  const [lpdFound, setLpdFound] = useState(false);
  const [manualActive, setManualActive] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showPlatePopup, setShowPlatePopup] = useState(false);
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const [showRetryPopup, setShowRetryPopup] = useState(false);
  const retryOpacity = useRef(new Animated.Value(0)).current;
  const [showTimeoutPopup, setShowTimeoutPopup] = useState(false);
  const timeoutOpacity = useRef(new Animated.Value(0)).current;

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
    if (countdown === 0 && !plateText) {
      setShowTimeoutPopup(true);
      Animated.timing(timeoutOpacity, {
        toValue: 1, duration: 250, useNativeDriver: true,
      }).start();
      const timer = setTimeout(() => {
        Animated.timing(timeoutOpacity, {
          toValue: 0, duration: 500, useNativeDriver: true,
        }).start(() => setShowTimeoutPopup(false));
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      timeoutOpacity.setValue(0);
      setShowTimeoutPopup(false);
    }
  }, [countdown, plateText, timeoutOpacity]);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setCountdown(15);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 0 : prev - 1);
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (plateText && countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [plateText]);

  const doRecognize = useCallback(async () => {
    if (processingRef.current || !cameraRef.current?.takeSnapshot) return;
    processingRef.current = true;
    try {
      const snapPath = await cameraRef.current.takeSnapshot();
      if (!snapPath || !mountedRef.current) return;
      const result = await recognizePlate(snapPath);
      if (!mountedRef.current) return;
      const hasPlate = result.plate && result.plate !== 'unknown';
      setLpdFound(!!hasPlate);
      console.log('[Entry] plate:', result.plate);
      if (hasPlate) {
        const detected = result.plate.toUpperCase();
        setCapturedImage(snapPath);
        if (isValidVietnamPlate(detected)) {
          setPlateText(detected);
          doneRef.current = true;
          notifySuccess().catch(() => {});
        } else {
          setPlateText(detected);
        }
      }
    } catch {
      // ignore
    } finally {
      processingRef.current = false;
    }
  }, []);

  useEffect(() => {
    doneRef.current = false;
    const tick = () => {
      if (doneRef.current || !cameraReady) return;
      doRecognize();
      if (!doneRef.current) {
        timerRef.current = setTimeout(tick, SNAP_INTERVAL);
      }
    };
    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doRecognize, cameraReady, scanKey]);

  const handleRetry = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    doneRef.current = false;
    setPlateText('');
    setLpdFound(false);
    setCountdown(15);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 0 : prev - 1);
    }, 1000);
    setScanKey(k => k + 1);
    setCapturedImage(null);
    setShowRetryPopup(true);
    setShowTimeoutPopup(false);
    timeoutOpacity.setValue(0);
  }, []);

  const handleConfirm = useCallback(async () => {
    const p = plateText.trim().toUpperCase();
    if (!isValidVietnamPlate(p)) { Alert.alert('Thông báo', 'Biển số không hợp lệ'); return; }
    navigation.navigate('NfcEntry', { plateText: p, mode: 'write', imageUri: capturedImage });
  }, [plateText, capturedImage, navigation]);

  const plateValid = isValidVietnamPlate(plateText);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} active={true} onCameraReady={() => setCameraReady(true)} />
        <TouchableOpacity style={styles.backBtnOverlay} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
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
        {showTimeoutPopup && (
          <Animated.View style={[styles.timeoutPopup, { opacity: timeoutOpacity }]}>
            <Icon name="close" size={16} color="#FFFFFF" />
            <Text style={styles.platePopupText}>Hết thời gian</Text>
          </Animated.View>
        )}
      </View>
      <View style={[styles.bottomPanel, { backgroundColor: colors.surface }]}>
        <View style={[styles.panelHandle, { backgroundColor: colors.border }]} />
        <Text style={[styles.panelTitle, { color: colors.text }]}>
          Quét xe vào
        </Text>
        <View style={[styles.plateInput, { borderColor: colors.inputBorder }]}>
          {countdown > 0 && !plateText ? (
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textMuted, minWidth: 24, textAlign: 'center' }}>
              {countdown}s
            </Text>
          ) : (
            <Icon name="camera" size={20} color={colors.textMuted} />
          )}
          <TextInput
            ref={inputRef}
            style={[styles.plateTextInput, { color: colors.text }]}
            value={lpdFound && !plateText ? `Đang nhận diện... (${countdown}s)` : plateText}
            onChangeText={setPlateText}
            placeholder=""
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            editable={manualActive}
          />
          {(!!plateText || countdown === 0) && (
            <TouchableOpacity onPress={() => {
              if (manualActive) {
                setManualActive(false);
                inputRef.current?.blur();
              } else {
                setManualActive(true);
                inputRef.current?.focus();
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
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
  },
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
  timeoutPopup: {
    position: 'absolute', top: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.9)',
    zIndex: 20,
  },
});

export default EntryScreen;
