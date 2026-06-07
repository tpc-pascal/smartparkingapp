import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  Clipboard,
  Alert,
  Linking,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { getDebugLogs, dumpDatabase, clearAllTables, executeSql, fetchSupabaseTable, triggerSync, triggerFullSync, deleteSupabaseTable, deleteAllSupabaseTables, clearTable } from '../utils/databaseHelper';
import { getCapturedLogs } from '../utils/consoleCapture';
import Icon from '../theme/Icon';

type ScreenTab = 'log' | 'js' | 'server';
type ServerSub = 'sqlite' | 'supabase';
type SqlRow = Record<string, unknown>;

const PRESETS = [
  { label: 'attendants', sql: 'SELECT * FROM attendants ORDER BY id DESC LIMIT 20' },
  { label: 'parking_logs', sql: 'SELECT * FROM parking_logs ORDER BY id DESC LIMIT 20' },
  { label: 'sessions', sql: 'SELECT * FROM sessions ORDER BY id DESC LIMIT 20' },
  { label: 'sqlite_master', sql: "SELECT name, type, sql FROM sqlite_master WHERE type='table' ORDER BY name" },
];

const SUPABASE_PRESETS = ['attendants', 'sessions', 'parking_logs'];

function DebugScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const listRef = useRef<FlatList<string>>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [tab, setTab] = useState<ScreenTab>('log');
  const [serverSub, setServerSub] = useState<ServerSub>('sqlite');
  const [nativeLogs, setNativeLogs] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState<string | null>(null);
  const [jsLogs, setJsLogs] = useState<{ level: string; message: string; timestamp: string }[]>([]);
  const [sqlRows, setSqlRows] = useState<SqlRow[]>([]);
  const [sqlCols, setSqlCols] = useState<string[]>([]);
  const [customSql, setCustomSql] = useState('');
  const [currentSql, setCurrentSql] = useState('');

  const [supaRows, setSupaRows] = useState<SqlRow[]>([]);
  const [supaCols, setSupaCols] = useState<string[]>([]);
  const [supaLoading, setSupaLoading] = useState(false);
  const [supaTable, setSupaTable] = useState('');

  const loadNativeLogs = useCallback(async () => {
    try {
      const all = await getDebugLogs(300);
      if (logFilter) {
        setNativeLogs(all.filter(l => l.startsWith(logFilter)));
      } else {
        setNativeLogs(all);
      }
    } catch {}
  }, [logFilter]);

  const loadJsLogs = useCallback(() => {
    setJsLogs(getCapturedLogs());
  }, []);

  const handleCopyAll = useCallback(() => {
    let text = '';
    if (tab === 'log') text = nativeLogs.join('\n');
    else if (tab === 'js') text = jsLogs.map(l => `[${l.level.toUpperCase()}] ${l.timestamp} ${l.message}`).join('\n');
    else if (serverSub === 'supabase') text = JSON.stringify(supaRows, null, 2);
    else text = JSON.stringify(sqlRows, null, 2);
    if (Clipboard?.setString) { try { Clipboard.setString(text); } catch {} }
    Alert.alert('Đã copy', `${text.split('\n').length} dòng`);
  }, [tab, serverSub, nativeLogs, jsLogs, sqlRows, supaRows]);

  const handleSendToGdocs = useCallback(async () => {
    let text = '';
    if (tab === 'log') text = nativeLogs.join('\n');
    else if (tab === 'js') text = jsLogs.map(l => `[${l.level.toUpperCase()}] ${l.timestamp} ${l.message}`).join('\n');
    else if (serverSub === 'supabase') text = JSON.stringify(supaRows, null, 2);
    else text = JSON.stringify(sqlRows, null, 2);
    if (Clipboard?.setString) { try { Clipboard.setString(text); } catch {} }
    const gdocUrl = 'https://docs.google.com/document/d/1wsjsV4Talux0SwYKz1qmFzPBuOMFlWAfU71jpa3Ta3o/edit';
    const canOpen = await Linking.canOpenURL(gdocUrl);
    if (canOpen) Linking.openURL(gdocUrl);
    Alert.alert('Đã copy logs', `${text.split('\n').length} dòng — dán vào Google Docs đã mở`);
  }, [tab, serverSub, nativeLogs, jsLogs, sqlRows, supaRows]);

  const handleClearNative = useCallback(async () => {
    const { NativeModules } = require('react-native');
    await NativeModules.DatabaseModule.clearDebugLogs?.();
    setNativeLogs([]);
  }, []);

  const handleClearDb = useCallback(() => {
    Alert.alert('Xóa toàn bộ dữ liệu?', 'SQLite + session sẽ bị xóa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xác nhận', style: 'destructive',
        onPress: async () => {
          try {
            await clearAllTables();
            setSqlRows([]);
            setSqlCols([]);
            setTimeout(() => navigation.goBack(), 1000);
          } catch (err: unknown) { Alert.alert('Lỗi', err instanceof Error ? err.message : 'Lỗi không xác định'); }
        },
      },
    ]);
  }, [navigation]);

  const runSql = useCallback(async (sql: string) => {
    try {
      setCurrentSql(sql);
      const rows: SqlRow[] = await executeSql(sql);
      if (rows.length > 0) setSqlCols(Object.keys(rows[0]));
      else setSqlCols([]);
      setSqlRows(rows);
    } catch (err: unknown) {
      Alert.alert('SQL Error', err instanceof Error ? err.message : 'Lỗi không xác định');
    }
  }, []);

  const fetchSupa = useCallback(async (tableName: string) => {
    setSupaLoading(true);
    setSupaTable(tableName);
    try {
      const rows: SqlRow[] = await fetchSupabaseTable(tableName);
      if (rows.length > 0) setSupaCols(Object.keys(rows[0]));
      else setSupaCols([]);
      setSupaRows(rows);
    } catch (err: unknown) {
      Alert.alert('Supabase Error', err instanceof Error ? err.message : 'Lỗi không xác định');
      setSupaRows([]);
      setSupaCols([]);
    } finally {
      setSupaLoading(false);
    }
  }, []);

  const handleClearTable = useCallback((tableName: string) => {
    Alert.alert(`Xóa ${tableName}?`, `Dữ liệu SQLite trong bảng ${tableName} sẽ bị xóa.`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xác nhận', style: 'destructive',
        onPress: async () => {
          try {
            await clearTable(tableName);
            setSqlRows([]);
            setSqlCols([]);
          } catch (err: unknown) { Alert.alert('Lỗi', err instanceof Error ? err.message : 'Lỗi không xác định'); }
        },
      },
    ]);
  }, []);

  const handleDeleteSupaTable = useCallback((tableName: string) => {
    Alert.alert(`Xóa ${tableName} trên Supabase?`, 'Dữ liệu sẽ bị xóa vĩnh viễn.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xác nhận', style: 'destructive',
        onPress: async () => {
          const ok = await deleteSupabaseTable(tableName);
          if (ok) { setSupaRows([]); setSupaCols([]); }
          else { Alert.alert('Lỗi', 'Không thể xóa bảng trên Supabase'); }
        },
      },
    ]);
  }, []);

  const handleDeleteAllSupa = useCallback(() => {
    Alert.alert('Xóa tất cả Supabase?', 'attendants + sessions + parking_logs sẽ bị xóa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xác nhận', style: 'destructive',
        onPress: async () => {
          const ok = await deleteAllSupabaseTables();
          if (ok) { setSupaRows([]); setSupaCols([]); }
          else { Alert.alert('Lỗi', 'Không thể xóa bảng trên Supabase'); }
        },
      },
    ]);
  }, []);

  const handleSyncThenFetch = useCallback(async (tableName: string) => {
    try {
      await triggerSync();
    } catch {}
    fetchSupa(tableName);
  }, [fetchSupa]);

  useEffect(() => {
    loadNativeLogs();
    intervalRef.current = setInterval(() => {
      if (tab === 'log') loadNativeLogs();
      else if (tab === 'js') loadJsLogs();
    }, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tab, loadNativeLogs, loadJsLogs]);

  useEffect(() => { if (tab === 'server' && serverSub === 'sqlite' && !currentSql) runSql(PRESETS[0].sql); }, [tab, serverSub, currentSql, runSql]);
  useEffect(() => { if (tab === 'server' && serverSub === 'supabase' && !supaTable) fetchSupa(SUPABASE_PRESETS[0]); }, [tab, serverSub, supaTable, fetchSupa]);

  const renderLog = useCallback(({ item }: { item: string }) => (
    <Text style={styles.logLine}>{item}</Text>
  ), []);

  const renderJsLog = useCallback(({ item }: { item: { level: string; message: string; timestamp: string } }) => {
    const color = item.level === 'error' ? '#E74C3C' : item.level === 'warn' ? '#F39C12' : '#2ECC71';
    return (
      <View style={styles.jsLine}>
        <Text style={[styles.jsLevel, { color }]}>[{item.level.toUpperCase()}]</Text>
        <Text style={styles.jsMsg} numberOfLines={5}>{item.message}</Text>
      </View>
    );
  }, []);

  const renderSqlRow = useCallback(({ item }: { item: SqlRow }) => (
    <View style={styles.sqlRow}>
      {sqlCols.map(col => (
        <Text key={col} style={styles.sqlCell} numberOfLines={2}>
          {item[col] === null || item[col] === undefined ? 'NULL' : String(item[col])}
        </Text>
      ))}
    </View>
  ), [sqlCols]);

  const renderSupaRow = useCallback(({ item }: { item: SqlRow }) => (
    <View style={styles.sqlRow}>
      {supaCols.map(col => (
        <Text key={col} style={styles.sqlCell} numberOfLines={2}>
          {item[col] === null || item[col] === undefined ? 'NULL' : String(item[col])}
        </Text>
      ))}
    </View>
  ), [supaCols]);

  const isServer = tab === 'server';

  return (
    <View style={[styles.container, { backgroundColor: '#0D0D0D' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Icon name="bug" size={18} color="#FFFFFF" />
          <Text style={styles.title}>Debug</Text>
        </View>
        <View style={styles.headerRight}>
          {isServer && serverSub === 'sqlite' && (
            <TouchableOpacity onPress={handleClearDb} style={[styles.headerBtn, styles.dangerBtn]}>
              <Text style={styles.dangerBtnText}>Xóa DB</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleCopyAll} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSendToGdocs} style={[styles.headerBtn, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
            <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: '700' }}>GDocs</Text>
          </TouchableOpacity>
          {tab === 'log' && (
            <TouchableOpacity onPress={handleClearNative} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Xóa</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Top tabs */}
      <View style={[styles.tabBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
        {(['log', 'js', 'server'] as ScreenTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && { color: colors.primary }]}>
              {t === 'log' ? 'Log' : t === 'js' ? 'JS Console' : 'Server'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Server sub-tabs */}
      {isServer && (
        <View style={[styles.subTabBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          {(['sqlite', 'supabase'] as ServerSub[]).map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.subTab, serverSub === s && { borderBottomColor: colors.primary }]}
              onPress={() => setServerSub(s)}
            >
              <Text style={[styles.subTabText, serverSub === s && { color: colors.primary }]}>
                {s === 'sqlite' ? 'SQLite' : 'Supabase'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* SQL preset buttons */}
      {isServer && serverSub === 'sqlite' && (
        <View style={[styles.presetBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          {PRESETS.map(p => (
            <View key={p.label} style={styles.presetWithDelete}>
              <TouchableOpacity
                style={[styles.presetBtn, currentSql === p.sql && styles.presetBtnActive]}
                onPress={() => runSql(p.sql)}
              >
                <Text style={[styles.presetText, currentSql === p.sql && styles.presetTextActive]}>{p.label}</Text>
              </TouchableOpacity>
              {p.label !== 'sqlite_master' && (
                <TouchableOpacity style={styles.deleteSmallBtn} onPress={() => handleClearTable(p.label)}>
                  <Text style={styles.deleteSmallText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <View style={styles.customSqlRow}>
            <TextInput
              style={styles.sqlInput}
              value={customSql}
              onChangeText={setCustomSql}
              placeholder="Custom SQL..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.runBtn} onPress={() => { if (customSql.trim()) runSql(customSql.trim()); }}>
              <Text style={styles.runBtnText}>Run</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Supabase preset buttons */}
      {isServer && serverSub === 'supabase' && (
        <View style={[styles.presetBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          {SUPABASE_PRESETS.map(t => (
            <View key={t} style={styles.presetWithDelete}>
              <TouchableOpacity
                style={[styles.presetBtn, supaTable === t && styles.presetBtnActive]}
                onPress={() => fetchSupa(t)}
              >
                <Text style={[styles.presetText, supaTable === t && styles.presetTextActive]}>{t}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteSmallBtn} onPress={() => handleDeleteSupaTable(t)}>
                <Text style={styles.deleteSmallText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={[styles.presetBtn, { backgroundColor: 'rgba(16,185,129,0.2)' }]} onPress={() => handleSyncThenFetch(supaTable || SUPABASE_PRESETS[0])}>
            <Text style={[styles.presetText, { color: '#10B981' }]}>Sync + Fetch</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.presetBtn, { backgroundColor: 'rgba(139,92,246,0.2)' }]} onPress={async () => { await triggerFullSync(); handleSyncThenFetch(supaTable || SUPABASE_PRESETS[0]); }}>
            <Text style={[styles.presetText, { color: '#8B5CF6' }]}>Full Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.presetBtn, { backgroundColor: 'rgba(231,76,60,0.2)' }]} onPress={handleDeleteAllSupa}>
            <Text style={[styles.presetText, { color: '#E74C3C' }]}>Xoá tất cả</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Column headers */}
      {isServer && serverSub === 'sqlite' && sqlCols.length > 0 && (
        <View style={styles.colHeader}>
          {sqlCols.map(col => (
            <Text key={col} style={styles.colHeaderText} numberOfLines={1}>{col}</Text>
          ))}
        </View>
      )}
      {isServer && serverSub === 'supabase' && supaCols.length > 0 && (
        <View style={styles.colHeader}>
          {supaCols.map(col => (
            <Text key={col} style={styles.colHeaderText} numberOfLines={1}>{col}</Text>
          ))}
        </View>
      )}

      {/* Content */}
      {tab === 'log' && (
        <View style={{ flex: 1 }}>
          <View style={[styles.presetBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
            {[null, '[SUPABASE]', '[SYNC]', '[DB]', '[ORT]'].map(f => (
              <TouchableOpacity
                key={f ?? 'all'}
                style={[styles.presetBtn, logFilter === f && styles.presetBtnActive]}
                onPress={() => setLogFilter(f)}
              >
                <Text style={[styles.presetText, logFilter === f && styles.presetTextActive]}>
                  {f ?? 'ALL'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            ref={listRef}
            data={nativeLogs}
            keyExtractor={(_, i) => i.toString()}
            renderItem={renderLog}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        </View>
      )}

      {tab === 'js' && (
        <FlatList
          data={jsLogs}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderJsLog}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {isServer && serverSub === 'sqlite' && (
        <FlatList
          data={sqlRows}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderSqlRow}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No results</Text>}
        />
      )}

      {isServer && serverSub === 'supabase' && (
        <FlatList
          data={supaRows}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderSupaRow}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{supaLoading ? 'Loading...' : 'No results — có thể do RLS chặn, thử Full Refresh'}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
  },
  backText: { fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerRight: { flexDirection: 'row', gap: 10 },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8 },
  headerBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  dangerBtn: { backgroundColor: 'rgba(231,76,60,0.2)' },
  dangerBtnText: { color: '#E74C3C', fontSize: 13, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },
  subTabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 40 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subTabText: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600' },
  presetBar: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingVertical: 8, gap: 6, borderBottomWidth: 1,
  },
  presetWithDelete: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  presetBtn: {
    paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6,
  },
  deleteSmallBtn: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(231,76,60,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteSmallText: { color: '#E74C3C', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  presetBtnActive: { backgroundColor: 'rgba(59,130,246,0.3)' },
  presetText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
  presetTextActive: { color: '#3B82F6' },
  customSqlRow: { flexDirection: 'row', width: '100%', marginTop: 4, gap: 6 },
  sqlInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6, color: '#FFFFFF', fontSize: 12, fontFamily: 'monospace',
  },
  runBtn: { backgroundColor: '#3B82F6', borderRadius: 6, paddingHorizontal: 14, justifyContent: 'center' },
  runBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  colHeader: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
  colHeaderText: { flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '700' },
  list: { paddingHorizontal: 10, paddingVertical: 6 },
  logLine: { color: '#2ECC71', fontSize: 9, fontFamily: 'monospace', lineHeight: 14, letterSpacing: 0.2 },
  jsLine: { flexDirection: 'row', paddingVertical: 2, gap: 6 },
  jsLevel: { fontSize: 9, fontWeight: '700', fontFamily: 'monospace', width: 50 },
  jsMsg: { flex: 1, color: '#E8E8E8', fontSize: 9, fontFamily: 'monospace', lineHeight: 14 },
  sqlRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', paddingVertical: 4 },
  sqlCell: { flex: 1, color: '#E8E8E8', fontSize: 8, fontFamily: 'monospace' },
  emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 40, fontSize: 14 },
});

export default DebugScreen;
