import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
  FlatList,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import Icon from '../theme/Icon';
import { searchParkingLogs, getActiveSession, getAllSessions, getParkingLogsBySession, ParkingLogResult, SessionInfo, getSettingInt } from '../utils/databaseHelper';
import { exportSessionToXlsx } from '../utils/exportHelper';
import SessionStats from '../components/SessionStats';
import { ThemeColors } from '../theme/colors';

const PAGE_SIZE = 30;
const CARD_HEIGHT = 72;

function calculateFee(timeIn: string, timeOut: string | undefined, ratePerHour: number = 10000): number {
  if (!timeOut) return 0;
  const inTime = new Date(timeIn).getTime();
  const outTime = new Date(timeOut).getTime();
  if (isNaN(inTime) || isNaN(outTime)) return 0;
  const diffMs = outTime - inTime;
  if (diffMs <= 0) return ratePerHour;
  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  return hours * ratePerHour;
}

function getParkedHours(timeIn: string, timeOut: string): number {
  const inTime = new Date(timeIn).getTime();
  const outTime = new Date(timeOut).getTime();
  if (isNaN(inTime) || isNaN(outTime)) return 0;
  const diffMs = outTime - inTime;
  if (diffMs <= 0) return 1;
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
}

function formatFee(fee: number): string {
  return fee.toLocaleString('vi-VN') + '₫';
}

const dateFormatter = new Intl.DateTimeFormat('vi-VN');
const timeFormatter = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function formatTime(iso: string): string {
  const d = new Date(iso);
  return dateFormatter.format(d) + ' ' + timeFormatter.format(d);
}

const SCREEN_W = Dimensions.get('window').width;

const formatImageUri = (uri: string | null | undefined): string | undefined => {
  if (!uri) return undefined;
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://') || uri.startsWith('data:')) {
    return uri;
  }
  return `file://${uri}`;
};

const LogCard = memo(function LogCard({ item, onDetailPress, colors }: { item: ParkingLogResult; onDetailPress: (item: ParkingLogResult) => void; colors: ThemeColors }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <View style={styles.cardBody}>
        <Text style={[styles.plateText, { color: colors.text }]}>{item.licensePlate}</Text>
        <Text style={[styles.timeText, { color: colors.textSecondary }]}>Vào: {formatTime(item.timeIn)}</Text>
        {item.timeOut && (
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>Ra: {formatTime(item.timeOut)}</Text>
        )}
      </View>
      <TouchableOpacity style={styles.eyeBtn} onPress={() => onDetailPress(item)} activeOpacity={0.7}>
        <Icon name="eye" size={20} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
});

function HistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [logs, setLogs] = useState<ParkingLogResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const pageRef = useRef({ searchText: '', sessionId: null as number | null, hasMore: true });
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'stats'>('list');
  const [allLogs, setAllLogs] = useState<ParkingLogResult[]>([]);
  const [statsFeeRate, setStatsFeeRate] = useState(10000);

  // Load sessions list and default to current active session
  useEffect(() => {
    (async () => {
      try {
        const all = await getAllSessions();
        setSessions(all);
        const active = await getActiveSession();
        if (active) {
          setSelectedSessionId(active.id);
          pageRef.current.sessionId = active.id;
        } else if (all.length > 0) {
          setSelectedSessionId(all[0].id);
          pageRef.current.sessionId = all[0].id;
        }
      } catch {}
    })();
  }, []);

  const fetchLogs = useCallback(async (reset: boolean) => {
    const curOffset = reset ? 0 : offset;
    try {
      const result = await searchParkingLogs(pageRef.current.searchText, false, false, pageRef.current.sessionId ?? undefined, curOffset, PAGE_SIZE);
      if (reset) {
        setLogs(result);
        setOffset(result.length);
      } else {
        setLogs(prev => [...prev, ...result]);
        setOffset(curOffset + result.length);
      }
      pageRef.current.hasMore = result.length >= PAGE_SIZE;
    } catch {}
  }, [offset]);

  const load = useCallback(async () => {
    setLoading(true);
    pageRef.current.searchText = '';
    pageRef.current.hasMore = true;
    await fetchLogs(true);
    setLoading(false);
  }, [fetchLogs]);

  useEffect(() => { if (selectedSessionId !== null) load(); }, [selectedSessionId, load]);

  const loadAllLogsForStats = useCallback(async () => {
    if (!selectedSessionId) return;
    try {
      const [logs, rate] = await Promise.all([
        getParkingLogsBySession(selectedSessionId),
        getSettingInt('fee_per_hour'),
      ]);
      setAllLogs(logs);
      setStatsFeeRate(rate ?? 10000);
    } catch {}
  }, [selectedSessionId]);

  const handleTabChange = useCallback((tab: 'list' | 'stats') => {
    setActiveTab(tab);
    if (tab === 'stats') {
      loadAllLogsForStats();
    }
  }, [loadAllLogsForStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleSearch = useCallback(() => {
    pageRef.current.searchText = searchText;
    pageRef.current.hasMore = true;
    setOffset(0);
    fetchLogs(true);
  }, [searchText, fetchLogs]);

  const handleSelectSession = useCallback((sessionId: number) => {
    setSelectedSessionId(sessionId);
    pageRef.current.sessionId = sessionId;
    pageRef.current.hasMore = true;
    setOffset(0);
    setShowSessionDropdown(false);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!pageRef.current.hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchLogs(false).finally(() => setLoadingMore(false));
  }, [fetchLogs, loadingMore]);

  const [detailLog, setDetailLog] = useState<ParkingLogResult | null>(null);
  const [detailFeeRate, setDetailFeeRate] = useState(10000);

  const handleImagePress = useCallback((uri: string) => setViewImage(uri), []);

  const handleDetailPress = useCallback(async (item: ParkingLogResult) => {
    const rate = await getSettingInt('fee_per_hour') ?? 10000;
    setDetailFeeRate(rate);
    setDetailLog(item);
  }, []);

  const renderItem = useCallback(({ item }: { item: ParkingLogResult }) => (
    <LogCard item={item} onDetailPress={handleDetailPress} colors={colors} />
  ), [colors, handleDetailPress]);

  const keyExtractor = useCallback((item: ParkingLogResult) => item.id.toString(), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <Modal visible={viewImage != null} transparent onRequestClose={() => setViewImage(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setViewImage(null)}>
          {viewImage && <Image source={{ uri: viewImage }} style={styles.modalImage} resizeMode="contain" />}
          <Text style={styles.modalHint}>Chạm để đóng</Text>
        </TouchableOpacity>
      </Modal>

      <Modal visible={detailLog != null} transparent animationType="fade" onRequestClose={() => setDetailLog(null)}>
        {detailLog && (
          <View style={styles.detailOverlay}>
            <View style={[styles.detailCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
              <Text style={[styles.detailTitle, { color: colors.text }]}>Chi tiết xe</Text>

              <TouchableOpacity onPress={() => detailLog.entryImage ? handleImagePress(formatImageUri(detailLog.entryImage)!) : null} activeOpacity={0.7}>
                {detailLog.entryImage ? (
                  <Image source={{ uri: formatImageUri(detailLog.entryImage) }} style={styles.detailThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.detailThumbPlaceholder, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.detailThumbText, { color: colors.textMuted }]}>📷 Không có ảnh vào</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => detailLog.exitImage ? handleImagePress(formatImageUri(detailLog.exitImage)!) : null} activeOpacity={0.7}>
                {detailLog.exitImage ? (
                  <Image source={{ uri: formatImageUri(detailLog.exitImage) }} style={styles.detailThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.detailThumbPlaceholder, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.detailThumbText, { color: colors.textMuted }]}>📷 Không có ảnh ra</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={[styles.detailDivider, { backgroundColor: colors.borderLight }]} />

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Biển số</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{detailLog.licensePlate}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Thời gian vào</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{formatTime(detailLog.timeIn)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Thời gian ra</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {detailLog.timeOut ? formatTime(detailLog.timeOut) : 'Chưa ra'}
                </Text>
              </View>
              {detailLog.timeOut && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Tổng phí</Text>
                  <Text style={[styles.detailValue, { color: colors.warning, fontWeight: '700' }]}>
                    {formatFee(calculateFee(detailLog.timeIn, detailLog.timeOut, detailFeeRate))}
                  </Text>
                </View>
              )}
              {detailLog.timeOut && (
                <Text style={[styles.detailFeeBreakdown, { color: colors.textMuted }]}>
                  ({getParkedHours(detailLog.timeIn, detailLog.timeOut)}h × {formatFee(detailFeeRate)})
                </Text>
              )}

              <TouchableOpacity style={[styles.detailCloseBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setDetailLog(null)} activeOpacity={0.7}>
                <Text style={[styles.detailCloseText, { color: colors.text }]}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Lịch sử xe</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.sessionRow}>
        <TouchableOpacity
          style={[styles.sessionDropdownBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setShowSessionDropdown(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.sessionDropdownText, { color: colors.text }]} numberOfLines={1}>
            {sessions.find(s => s.id === selectedSessionId)?.name || 'Chọn phiên'}
          </Text>
          <Icon name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        {selectedSessionId && (
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
            onPress={async () => {
              try {
                const session = sessions.find(s => s.id === selectedSessionId);
                if (!session) return;
                const rate = await getSettingInt('fee_per_hour') ?? 10000;
                const logs = await getParkingLogsBySession(selectedSessionId);
                await exportSessionToXlsx(session, logs, rate);
              } catch {}
            }}
            activeOpacity={0.7}
          >
            <Icon name="download" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showSessionDropdown} transparent animationType="fade" onRequestClose={() => setShowSessionDropdown(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowSessionDropdown(false)}>
          <View style={[styles.dropdownCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Text style={[styles.dropdownTitle, { color: colors.textSecondary }]}>Chọn phiên</Text>
            <FlatList
              data={sessions}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    item.id === selectedSessionId && { backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => handleSelectSession(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.dropdownItemText,
                    { color: item.id === selectedSessionId ? colors.primary : colors.text },
                    item.id === selectedSessionId && { fontWeight: '700' },
                  ]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.dropdownItemSub, { color: colors.textMuted }]}>
                    {item.status === 'active' ? 'Đang hoạt động' : 'Đã kết thúc'}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={[styles.dropdownSeparator, { backgroundColor: colors.borderLight }]} />}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'list' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
          onPress={() => handleTabChange('list')}
          activeOpacity={0.7}
        >
          <Icon name="list" size={16} color={activeTab === 'list' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === 'list' ? colors.primary : colors.textMuted }]}>Danh sách</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'stats' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
          onPress={() => handleTabChange('stats')}
          activeOpacity={0.7}
        >
          <Icon name="bar-chart" size={16} color={activeTab === 'stats' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === 'stats' ? colors.primary : colors.textMuted }]}>Thống kê</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'list' && (
        <View style={styles.searchRow}>
          <View style={[styles.searchInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Icon name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchField, { color: colors.text }]}
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={handleSearch}
              placeholder="Tìm biển số..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              returnKeyType="search"
            />
          </View>
        </View>
      )}

      {activeTab === 'list' && (loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
      ) : (
        <FlashList
          data={logs}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          drawDistance={200}
          estimatedItemSize={CARD_HEIGHT}
          contentContainerStyle={logs.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>Không có dữ liệu</Text>}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={{ padding: 12 }} /> : null}
        />
      ))}

      {activeTab === 'stats' && (
        allLogs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Không có dữ liệu thống kê</Text>
          </View>
        ) : (
          <SessionStats logs={allLogs} feePerHour={statsFeeRate} />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10,
  },
  sessionDropdownBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  sessionDropdownText: { fontSize: 14, fontWeight: '600', flex: 1 },
  exportBtn: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  dropdownOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 20,
  },
  dropdownCard: {
    width: '90%', maxHeight: '70%', borderRadius: 16, padding: 16,
    borderWidth: 1,
  },
  dropdownTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  dropdownItemText: { fontSize: 15, fontWeight: '600' },
  dropdownItemSub: { fontSize: 12, marginTop: 2 },
  dropdownSeparator: { height: 1 },
  tabRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  searchRow: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1 },
  searchField: { flex: 1, paddingVertical: 10, fontSize: 15 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13 },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14 },
  card: {
    flexDirection: 'row', borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, alignItems: 'center',
  },
  cardBody: { flex: 1 },
  plateText: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  timeText: { fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  eyeBtn: { padding: 8, marginLeft: 8 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalImage: { width: SCREEN_W, height: SCREEN_W * 1.3 },
  modalHint: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 20 },
  detailOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 20,
  },
  detailCard: {
    width: '100%', borderRadius: 16, padding: 20,
    borderWidth: 1, gap: 12,
  },
  detailTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  detailThumb: { width: '100%', height: 140, borderRadius: 10 },
  detailThumbPlaceholder: { width: '100%', height: 60, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  detailThumbText: { fontSize: 13 },
  detailDivider: { height: 1, marginVertical: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: '600' },
  detailFeeBreakdown: { fontSize: 12, textAlign: 'right', marginTop: -8 },
  detailCloseBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, marginTop: 4 },
  detailCloseText: { fontSize: 16, fontWeight: '600' },
});

export default HistoryScreen;
