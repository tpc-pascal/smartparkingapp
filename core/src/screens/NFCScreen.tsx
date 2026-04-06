import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { writeNdef, readNdef, cancelWrite } from '../utils/nfcHelper';
import { recordEntryFull, recordExitFull, searchParkingLogs, ParkingLogResult, notifySuccess } from '../utils/databaseHelper';
import Icon from '../theme/Icon';

function NFCScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'NfcEntry'>>();
  const { mode, plateText, imageUri } = route.params;
  const { attendantId, attendantName } = useAuth();
  const { session } = useSession();
  const entryImage = mode === 'write' ? imageUri : undefined;
  const exitImage = mode === 'read' ? imageUri : undefined;
  const [status, setStatus] = useState<'idle' | 'waiting' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [nfcData, setNfcData] = useState('');
  const [verifiedLog, setVerifiedLog] = useState<ParkingLogResult | null>(null);
  const displayName = attendantName.split('@')[0];

  useEffect(() => {
    if (!session) {
      Alert.alert('Chưa có phiên', 'Vui lòng tạo phiên trước khi ghi/đọc thẻ NFC.');
      navigation.goBack();
    }
    return () => { cancelWrite().catch(() => {}); };
  }, [session, navigation]);

  const handleWriteNfc = useCallback(async () => {
    if (!session) {
      Alert.alert('Lỗi', 'Phiên làm việc đã kết thúc');
      navigation.goBack();
      return;
    }
    setStatus('waiting');
    try {
      const ts = new Date().toISOString();
      await writeNdef(`${attendantId}|${ts}|${plateText}|${session.id}`);
      setStatus('success');
      notifySuccess().catch(() => {});
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi ghi thẻ');
      setStatus('error');
    }
  }, [attendantId, plateText, session, navigation]);

  const handleReadNfc = useCallback(async () => {
    if (!session) {
      Alert.alert('Lỗi', 'Phiên làm việc đã kết thúc');
      navigation.goBack();
      return;
    }
    setStatus('waiting');
    try {
      const decrypted = await readNdef();
      const parts = decrypted.split('|');
      if (parts.length < 4) {
        setErrorMsg('Dữ liệu thẻ không hợp lệ');
        setStatus('error');
        return;
      }
      const nfcSessionId = parseInt(parts[3], 10);
      if (nfcSessionId !== session.id) {
        setErrorMsg('Thẻ NFC không thuộc phiên hiện tại');
        setStatus('error');
        return;
      }
      const nfcPlate = parts[2];
      const logs = await searchParkingLogs(nfcPlate, true);
      const matched = logs.find(l => l.sessionId === session.id);
      if (!matched) {
        setErrorMsg('Không tìm thấy bản ghi xe vào tương ứng trong phiên hiện tại');
        setStatus('error');
        return;
      }
      setVerifiedLog(matched);
      setNfcData(decrypted);
      setStatus('success');
      notifySuccess().catch(() => {});
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đọc thẻ');
      setStatus('error');
    }
  }, [session]);

  const handleRetry = useCallback(() => {
    setStatus('idle');
    setErrorMsg('');
    setNfcData('');
    setVerifiedLog(null);
  }, []);

  const handleEntrySuccess = useCallback(async () => {
    if (!session) {
      Alert.alert('Lỗi', 'Phiên làm việc đã kết thúc');
      navigation.goBack();
      return;
    }
    setStatus('processing');
    const ts = new Date().toISOString();
    try {
      await recordEntryFull(plateText, ts, entryImage, session.id);
      Alert.alert('Thành công', `Đã ghi nhận xe vào: ${plateText}`);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (err: unknown) {
      try { await writeNdef('ERASED|0||0'); } catch { /* compensation: xoá tag nếu DB fail */ }
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể ghi nhận');
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [plateText, entryImage, session, navigation]);

  const handleExitSuccess = useCallback(async () => {
    const parts = nfcData.split('|');
    const nfcPlate = parts.length >= 3 ? parts[2] : '';
    if (!nfcPlate) {
      Alert.alert('Lỗi', 'Dữ liệu thẻ không hợp lệ');
      return;
    }
    setStatus('processing');
    try {
      await recordExitFull(nfcPlate, exitImage);
      try {
        await writeNdef('ERASED|0||0');
      } catch {
        /* không block nếu xoá thẻ thất bại */
      }
      Alert.alert('Thành công', `Đã ghi nhận xe ra: ${nfcPlate}`);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể ghi nhận xe ra');
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [nfcData, exitImage, navigation]);

  const nfcPlate = nfcData.split('|').length >= 3 ? nfcData.split('|')[2] : '';
  const nfcTagContent = mode === 'write' && status === 'success'
    ? `${attendantId}|...|${plateText}|${session?.id || '?'}`
    : (mode === 'read' && status === 'success' ? nfcData : null);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="back" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>{mode === 'write' ? 'Ghi thẻ NFC' : 'Đọc thẻ NFC'}</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Biển số</Text>
            <Text style={styles.infoValue}>{plateText}</Text>
          </View>

          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nhân viên</Text>
            <Text style={styles.infoValue}>{displayName}</Text>
          </View>
        </View>

        {status === 'idle' && (
          <TouchableOpacity style={styles.nfcButton} onPress={mode === 'write' ? handleWriteNfc : handleReadNfc} activeOpacity={0.7}>
            <Text style={styles.nfcIcon}>📟</Text>
            <Text style={styles.nfcButtonText}>Chạm để {mode === 'write' ? 'ghi' : 'đọc'} thẻ</Text>
          </TouchableOpacity>
        )}

        {status === 'waiting' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color="#4A90D9" />
            <Text style={styles.statusText}>Đang chờ thẻ NFC...</Text>
            <Text style={styles.statusHint}>Hãy chạm thẻ vào mặt sau điện thoại</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={handleRetry}>
              <Text style={styles.cancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'success' && mode === 'write' && (
          <View style={styles.statusContainer}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>Ghi thẻ thành công!</Text>
            <TouchableOpacity style={styles.confirmButton} onPress={handleEntrySuccess}>
              <Text style={styles.confirmText}>Hoàn tất</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'success' && mode === 'read' && (
          <View style={styles.statusContainer}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>Đọc thẻ thành công!</Text>
            <Text style={styles.nfcPlateText}>Xe ra: {nfcPlate || 'Không xác định'}</Text>
            <TouchableOpacity style={styles.confirmButton} onPress={handleExitSuccess}>
              <Text style={styles.confirmText}>Hoàn tất</Text>
            </TouchableOpacity>
          </View>
        )}

        {(status === 'error') && (
          <View style={styles.statusContainer}>
            <Text style={styles.errorIcon}>✕</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'processing' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color="#2ECC71" />
            <Text style={styles.statusText}>Đang xử lý...</Text>
          </View>
        )}
      </View>

      {nfcTagContent && (
        <View style={styles.nfcFooter}>
          <Text style={styles.nfcFooterText} numberOfLines={1}>{nfcTagContent}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  backButton: { position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  backText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  infoCard: { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  infoLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  infoValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  nfcButton: { width: '100%', backgroundColor: '#4A90D9', paddingVertical: 20, borderRadius: 16, alignItems: 'center', gap: 8 },
  nfcIcon: { fontSize: 36 },
  nfcButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  statusContainer: { alignItems: 'center', gap: 12 },
  statusText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginTop: 12 },
  statusHint: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  cancelButton: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  cancelText: { color: '#FFFFFF', fontSize: 14 },
  successIcon: { fontSize: 48, color: '#2ECC71', fontWeight: '700' },
  successText: { color: '#2ECC71', fontSize: 18, fontWeight: '700' },
  nfcPlateText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  nfcFooter: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  nfcFooterText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' },
  confirmButton: { marginTop: 12, backgroundColor: 'rgba(46,204,113,0.15)', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(46,204,113,0.4)' },
  confirmText: { color: '#2ECC71', fontSize: 16, fontWeight: '700' },
  errorIcon: { fontSize: 48, color: '#E74C3C', fontWeight: '700' },
  errorText: { color: '#E74C3C', fontSize: 15, textAlign: 'center' },
  retryButton: { marginTop: 12, backgroundColor: 'rgba(255,193,7,0.85)', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 14 },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});

export default NFCScreen;
