import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  FlatList,
  TextInput,
  Modal,
  Image,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import Icon, { AvatarCircle } from '../theme/Icon';
import { getTodayStats, getCurrentlyParked, isOnline, getRemainingCount, TodayStats, ParkingLogResult } from '../utils/databaseHelper';
import { useSession } from '../context/SessionContext';

type StatKey = 'entryCount' | 'exitCount' | 'parkedCount';

const STAT_ITEMS: { key: StatKey; label: string }[] = [
  { key: 'parkedCount', label: 'Trong bãi' },
  { key: 'entryCount', label: 'Xe vào' },
  { key: 'exitCount', label: 'Xe ra' },
];

const formatImageUri = (uri: string | null | undefined): string | undefined => {
  if (!uri) return undefined;
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://') || uri.startsWith('data:')) {
    return uri;
  }
  return `file://${uri}`;
};

function HomeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { attendantId, attendantName, logout } = useAuth();
  const { session, createNewSession, endCurrentSession, refresh: refreshSession } = useSession();
  const [stats, setStats] = useState<TodayStats>({ entryCount: 0, exitCount: 0, parkedCount: 0 });
  const [parked, setParked] = useState<ParkingLogResult[]>([]);
  const [online, setOnline] = useState(false);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const sessionInputRef = useRef<TextInput>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, p, net] = await Promise.all([getTodayStats(), getCurrentlyParked(), isOnline()]);
      setStats(s);
      setParked(p);
      setOnline(net);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    const interval = setInterval(async () => { try { setOnline(await isOnline()); } catch {} }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleEndSession = useCallback(() => {
    if (!session) return;
    (async () => {
      try {
        const count = await getRemainingCount(session.id);
        if (count > 0) {
          Alert.alert(
            'Còn xe chưa ra',
            `Còn ${count} xe của "${session.name}" chưa ra. Bạn có chắc muốn kết thúc phiên?`,
            [
              { text: 'Huỷ', style: 'cancel' },
              { text: 'Kết thúc', style: 'destructive', onPress: async () => { await endCurrentSession(); } },
            ]
          );
        } else {
          Alert.alert('Kết thúc phiên', 'Xác nhận kết thúc phiên?', [
            { text: 'Huỷ', style: 'cancel' },
            { text: 'Kết thúc', style: 'destructive', onPress: async () => { await endCurrentSession(); } },
          ]);
        }
      } catch {}
    })();
  }, [session, endCurrentSession]);

  const handleLogout = useCallback(() => {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  const handleCreateSession = useCallback(async (name: string) => {
    try {
      await createNewSession(name);
      await refreshSession();
      refresh();
    } catch (e: unknown) {
      Alert.alert('Lỗi', `Không thể tạo phiên:\n${e instanceof Error ? e.message : 'Lỗi không xác định'}`);
    }
  }, [createNewSession, refreshSession, refresh]);

  const displayName = attendantName.split('@')[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <View style={[styles.topBar, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.profileSection}>
          <AvatarCircle label={displayName} size={40} />
          <View style={styles.profileText}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Xin chào,</Text>
            <Text style={[styles.userName, { color: colors.text }]}>{displayName}</Text>
          </View>
        </View>
        <View style={styles.rightBar}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('Settings')}>
            <Icon name="settings" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Icon name="wifi" size={18} color={online ? colors.success : colors.danger} />
          <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]} onPress={handleLogout}>
            <Icon name="logout" size={14} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {session ? (
        <>
          <View style={[styles.sessionBar, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
            <View style={styles.sessionInfo}>
              <Text style={[styles.sessionLabel, { color: colors.textSecondary }]}>Phiên hiện tại</Text>
              <Text style={[styles.sessionName, { color: colors.text }]}>{session.name}</Text>
            </View>
            <TouchableOpacity style={[styles.endSessionBtn, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]} onPress={handleEndSession}>
              <Text style={[styles.endSessionText, { color: colors.danger }]}>Kết thúc</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('Entry')} activeOpacity={0.7}>
              <View style={styles.actionIconWrap}>
                <Icon name="entry" size={36} color={colors.primary} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Quét xe vào</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('Exit')} activeOpacity={0.7}>
              <View style={styles.actionIconWrap}>
                <Icon name="exit" size={36} color={colors.accent} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Quét xe ra</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('History')} activeOpacity={0.7}>
              <View style={styles.actionIconWrap}>
                <Icon name="history" size={36} color={colors.success} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Lịch sử</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Xe đang trong bãi</Text>

          <View style={styles.statsRow}>
            {STAT_ITEMS.map(({ key, label }) => (
              <View key={key} style={[styles.statCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{stats[key]}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            ))}
          </View>

          <FlatList
            data={parked}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={parked.length === 0 ? styles.emptyList : styles.list}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>Không có xe nào trong bãi</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.parkedCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
                onPress={() => item.entryImage ? setExpandedImage(formatImageUri(item.entryImage) || null) : null}
                activeOpacity={0.7}
              >
                <View style={[styles.parkedLeft, { backgroundColor: colors.successLight }]}>
                  <View style={[styles.parkedDot, { backgroundColor: colors.success }]} />
                </View>
                <View style={styles.parkedBody}>
                  <Text style={[styles.parkedPlate, { color: colors.text }]}>{item.licensePlate}</Text>
                  <Text style={[styles.parkedTime, { color: colors.textSecondary }]}>Vào lúc: {new Date(item.timeIn).toLocaleTimeString('vi-VN')}</Text>
                </View>
                {item.entryImage ? (
                  <Image source={{ uri: formatImageUri(item.entryImage) }} style={styles.parkedImage} />
                ) : null}
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <View style={styles.centerContent}>
          <TouchableOpacity style={[styles.createSessionBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]} onPress={() => { setSessionName(''); setSessionModalVisible(true); }} activeOpacity={0.7}>
            <Icon name="parking" size={18} color={colors.primary} />
            <Text style={[styles.createSessionText, { color: colors.primary }]}>Tạo phiên</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={sessionModalVisible} transparent animationType="fade" onShow={() => sessionInputRef.current?.focus()}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Tạo phiên mới</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Nhập tên phiên (ví dụ: Phiên cưới A)</Text>
            <TextInput
              ref={sessionInputRef}
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={sessionName}
              onChangeText={setSessionName}
              placeholder="Tên phiên"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setSessionModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={async () => { setSessionModalVisible(false); await handleCreateSession(sessionName || 'Phiên mới'); }}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Tạo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!expandedImage} transparent animationType="fade">
        <TouchableOpacity style={styles.imageModalOverlay} onPress={() => setExpandedImage(null)} activeOpacity={1}>
          {expandedImage && (
            <Image source={{ uri: expandedImage }} style={styles.expandedImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileText: { gap: 2 },
  greeting: { fontSize: 13 },
  userName: { fontSize: 18, fontWeight: '700' },
  rightBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '500' },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: { fontSize: 12, fontWeight: '600' },
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  sessionInfo: { gap: 2 },
  sessionLabel: { fontSize: 11, fontWeight: '500' },
  sessionName: { fontSize: 14, fontWeight: '700' },
  endSessionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  endSessionText: { fontSize: 12, fontWeight: '700' },
  createSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  createSessionText: { fontSize: 14, fontWeight: '700' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14 },
  parkedCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
  },
  parkedLeft: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  parkedDot: { width: 8, height: 8, borderRadius: 4 },
  parkedBody: { flex: 1 },
  parkedPlate: { fontSize: 15, fontWeight: '700' },
  parkedTime: { fontSize: 11, marginTop: 1 },
  parkedImage: { width: 60, height: 60, borderRadius: 10, marginLeft: 8, backgroundColor: '#000' },
  imageModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.9)' },
  expandedImage: { width: '95%', height: '80%' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: '85%', borderRadius: 16, padding: 24, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  modalInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, borderWidth: 1, marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1 },
  modalBtnPrimary: {},
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});

export default HomeScreen;
