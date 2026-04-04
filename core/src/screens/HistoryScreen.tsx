import React, { useState, useEffect, useCallback, memo } from 'react';
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
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import Icon from '../theme/Icon';
import { searchParkingLogs, ParkingLogResult } from '../utils/databaseHelper';
import { ThemeColors } from '../theme/colors';

const PAGE_SIZE = 30;
const CARD_HEIGHT = 72;

function calculateFee(timeIn: string, timeOut: string | undefined): number {
  if (!timeOut) return 0;
  const diffMs = new Date(timeOut).getTime() - new Date(timeIn).getTime();
  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  return hours * 10000;
}

function formatFee(fee: number): string {
  return fee.toLocaleString('vi-VN') + '₫';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

const SCREEN_W = Dimensions.get('window').width;

const LogCard = memo(function LogCard({ item, onImagePress, colors }: { item: ParkingLogResult; onImagePress: (uri: string) => void; colors: ThemeColors }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <TouchableOpacity onPress={() => { if (item.entryImage) onImagePress(item.entryImage); }}>
        {item.entryImage ? (
          <Image source={{ uri: item.entryImage }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.primaryLight }]}>
            <Icon name="car" size={20} color={colors.primary} />
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.cardBody}>
        <Text style={[styles.plateText, { color: colors.text }]}>{item.licensePlate}</Text>
        <Text style={[styles.timeText, { color: colors.textSecondary }]}>Vào: {formatTime(item.timeIn)}</Text>
        {item.timeOut ? (
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>Ra: {formatTime(item.timeOut)}</Text>
        ) : (
          <View style={[styles.badge, { backgroundColor: colors.successLight }]}>
            <Text style={[styles.badgeText, { color: colors.success }]}>Trong bãi</Text>
          </View>
        )}
      </View>
      <View style={styles.cardRight}>
        {item.timeOut && (
          <Text style={[styles.feeText, { color: colors.warning }]}>{formatFee(item.fee ?? calculateFee(item.timeIn, item.timeOut))}</Text>
        )}
      </View>
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
  const [filter, setFilter] = useState<'all' | 'parked' | 'exited'>('all');
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const pageRef = React.useRef({ searchText: '', filter: 'all' as 'all' | 'parked' | 'exited', hasMore: true });

  const fetchLogs = useCallback(async (reset: boolean) => {
    const curOffset = reset ? 0 : offset;
    try {
      const result = await searchParkingLogs(pageRef.current.searchText, pageRef.current.filter === 'parked', curOffset, PAGE_SIZE);
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
    pageRef.current.filter = 'all';
    pageRef.current.hasMore = true;
    await fetchLogs(true);
    setLoading(false);
  }, [fetchLogs]);

  useEffect(() => { load(); }, []);

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

  const handleFilter = useCallback((f: 'all' | 'parked' | 'exited') => {
    setFilter(f);
    setSearchText('');
    pageRef.current.searchText = '';
    pageRef.current.filter = f;
    pageRef.current.hasMore = true;
    setOffset(0);
    searchParkingLogs('', f === 'parked', 0, PAGE_SIZE).then(r => setLogs(r)).catch(() => {});
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!pageRef.current.hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchLogs(false).finally(() => setLoadingMore(false));
  }, [fetchLogs, loadingMore]);

  const handleImagePress = useCallback((uri: string) => setViewImage(uri), []);

  const renderItem = useCallback(({ item }: { item: ParkingLogResult }) => (
    <LogCard item={item} onImagePress={handleImagePress} colors={colors} />
  ), [colors, handleImagePress]);

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

      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Lịch sử xe</Text>
        <View style={styles.backBtn} />
      </View>

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

      <View style={styles.filterRow}>
        {(['all', 'parked', 'exited'] as const).map(f => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, active ? { backgroundColor: colors.primaryLight, borderColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleFilter(f)}
            >
              <Icon name="filter" size={12} color={active ? colors.primary : colors.textMuted} />
              <Text style={[styles.filterText, { color: active ? colors.primary : colors.textSecondary }]}>
                {f === 'all' ? 'Tất cả' : f === 'parked' ? 'Trong bãi' : 'Đã ra'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
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
          contentContainerStyle={logs.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>Không có dữ liệu</Text>}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={{ padding: 12 }} /> : null}
        />
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
  thumb: { width: 48, height: 48, borderRadius: 10, marginRight: 12 },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1 },
  plateText: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  timeText: { fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardRight: { alignItems: 'flex-end', marginLeft: 8 },
  feeText: { fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalImage: { width: SCREEN_W, height: SCREEN_W * 1.3 },
  modalHint: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 20 },
});

export default HistoryScreen;
