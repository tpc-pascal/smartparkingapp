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
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { getDebugLogs, dumpDatabase, clearAllTables, executeSql } from '../utils/databaseHelper';
import { getCapturedLogs } from '../utils/consoleCapture';

type ScreenTab = 'log' | 'js' | 'sqlite';

const PRESETS = [
  { label: 'attendants', sql: 'SELECT * FROM attendants ORDER BY id DESC LIMIT 20' },
  { label: 'parking_logs', sql: 'SELECT * FROM parking_logs ORDER BY id DESC LIMIT 20' },
  { label: 'sessions', sql: 'SELECT * FROM sessions ORDER BY id DESC LIMIT 20' },
  { label: 'sqlite_master', sql: "SELECT name, type, sql FROM sqlite_master WHERE type='table' ORDER BY name" },
];

function DebugScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const listRef = useRef<FlatList>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [tab, setTab] = useState<ScreenTab>('log');
  const [nativeLogs, setNativeLogs] = useState<string[]>([]);
  const [jsLogs, setJsLogs] = useState<{ level: string; message: string; timestamp: string }[]>([]);
  const [sqlRows, setSqlRows] = useState<any[]>([]);
  const [sqlCols, setSqlCols] = useState<string[]>([]);
  const [customSql, setCustomSql] = useState('');
  const [currentSql, setCurrentSql] = useState('');

  const loadNativeLogs = useCallback(async () => {
    try {
      setNativeLogs(await getDebugLogs(300));
    } catch {}
  }, []);

  const loadJsLogs = useCallback(() => {
    setJsLogs(getCapturedLogs());
  }, []);

  const handleCopyAll = useCallback(() => {
    let text = '';
    if (tab === 'log') text = nativeLogs.join('\n');
    else if (tab === 'js') text = jsLogs.map(l => `[${l.level.toUpperCase()}] ${l.timestamp} ${l.message}`).join('\n');
    else text = JSON.stringify(sqlRows, null, 2);
    Clipboard.setString(text);
    Alert.alert('Đã copy', `${text.split('\n').length} dòng`);
  }, [tab, nativeLogs, jsLogs, sqlRows]);

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
          } catch (err: any) { Alert.alert('Lỗi', err.message); }
        },
      },
    ]);
  }, [navigation]);

  const runSql = useCallback(async (sql: string) => {
    try {
      setCurrentSql(sql);
      const rows: any[] = await executeSql(sql);
      if (rows.length > 0) setSqlCols(Object.keys(rows[0]));
      else setSqlCols([]);
      setSqlRows(rows);
    } catch (err: any) {
      Alert.alert('SQL Error', err.message);
    }
  }, []);

  useEffect(() => {
    loadNativeLogs();
    intervalRef.current = setInterval(() => {
      if (tab === 'log') loadNativeLogs();
      else if (tab === 'js') loadJsLogs();
    }, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tab, loadNativeLogs, loadJsLogs]);

  useEffect(() => { if (tab === 'sqlite' && !currentSql) runSql(PRESETS[0].sql); }, [tab, currentSql, runSql]);

  const renderLog = ({ item }: { item: string }) => (
    <Text style={styles.logLine}>{item}</Text>
  );

  const renderJsLog = ({ item }: { item: { level: string; message: string; timestamp: string } }) => {
    const color = item.level === 'error' ? '#E74C3C' : item.level === 'warn' ? '#F39C12' : '#2ECC71';
    return (
      <View style={styles.jsLine}>
        <Text style={[styles.jsLevel, { color }]}>[{item.level.toUpperCase()}]</Text>
        <Text style={styles.jsMsg} numberOfLines={5}>{item.message}</Text>
      </View>
    );
  };

  const renderSqlRow = ({ item }: { item: any }) => (
    <View style={styles.sqlRow}>
      {sqlCols.map(col => (
        <Text key={col} style={styles.sqlCell} numberOfLines={2}>
          {item[col] === null || item[col] === undefined ? 'NULL' : String(item[col])}
        </Text>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: '#0D0D0D' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.primary }]}>← Đóng</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Debug</Text>
        <View style={styles.headerRight}>
          {tab === 'sqlite' && (
            <TouchableOpacity onPress={handleClearDb} style={[styles.headerBtn, styles.dangerBtn]}>
              <Text style={styles.dangerBtnText}>Xóa DB</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleCopyAll} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Copy</Text>
          </TouchableOpacity>
          {tab === 'log' && (
            <TouchableOpacity onPress={handleClearNative} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Xóa</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
        {(['log', 'js', 'sqlite'] as ScreenTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && { color: colors.primary }]}>
              {t === 'log' ? 'Log' : t === 'js' ? 'JS Console' : 'SQLite'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SQL preset buttons */}
      {tab === 'sqlite' && (
        <View style={[styles.presetBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          {PRESETS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.presetBtn, currentSql === p.sql && styles.presetBtnActive]}
              onPress={() => runSql(p.sql)}
            >
              <Text style={[styles.presetText, currentSql === p.sql && styles.presetTextActive]}>{p.label}</Text>
            </TouchableOpacity>
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

      {/* Column headers for SQLite */}
      {tab === 'sqlite' && sqlCols.length > 0 && (
        <View style={styles.colHeader}>
          {sqlCols.map(col => (
            <Text key={col} style={styles.colHeaderText} numberOfLines={1}>{col}</Text>
          ))}
        </View>
      )}

      {/* Content */}
      {tab === 'log' && (
        <FlatList
          ref={listRef}
          data={nativeLogs}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderLog}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
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

      {tab === 'sqlite' && (
        <FlatList
          data={sqlRows}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderSqlRow}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No results</Text>}
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
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerRight: { flexDirection: 'row', gap: 10 },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8 },
  headerBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  dangerBtn: { backgroundColor: 'rgba(231,76,60,0.2)' },
  dangerBtnText: { color: '#E74C3C', fontSize: 13, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },
  presetBar: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingVertical: 8, gap: 6, borderBottomWidth: 1,
  },
  presetBtn: {
    paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6,
  },
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
