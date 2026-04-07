import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { ParkingLogResult } from '../utils/databaseHelper';
import { ThemeColors } from '../theme/colors';

function calculateFee(timeIn: string, timeOut: string | undefined, ratePerHour: number): number {
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

interface BarDatum {
  label: string;
  count: number;
}

interface SessionStatsProps {
  logs: ParkingLogResult[];
  feePerHour: number;
}

function BarChart({ data, color, maxCount }: { data: BarDatum[]; color: string; maxCount: number }) {
  const barMaxH = 100;
  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.barsRow}>
        {data.map((d, i) => {
          const h = maxCount > 0 ? (d.count / maxCount) * barMaxH : 0;
          return (
            <View key={i} style={chartStyles.barCol}>
              <Text style={chartStyles.countLabel}>{d.count}</Text>
              <View style={[chartStyles.bar, { height: h, backgroundColor: color }]} />
              <Text style={chartStyles.label}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { paddingVertical: 8 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 140 },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: '60%', borderRadius: 4, minHeight: 2 },
  countLabel: { fontSize: 9, fontWeight: '600', marginBottom: 2, color: 'rgba(255,255,255,0.6)' },
  label: { fontSize: 8, marginTop: 4, color: 'rgba(255,255,255,0.5)' },
});

function SessionStats({ logs, feePerHour }: SessionStatsProps) {
  const { colors } = useTheme();

  const exited = useMemo(() => logs.filter(l => !!l.timeOut), [logs]);
  const parked = useMemo(() => logs.filter(l => !l.timeOut), [logs]);
  const totalFee = useMemo(() => exited.reduce((s, l) => s + calculateFee(l.timeIn, l.timeOut, feePerHour), 0), [exited, feePerHour]);
  const avgFee = exited.length > 0 ? totalFee / exited.length : 0;
  const maxFee = exited.length > 0 ? Math.max(...exited.map(l => calculateFee(l.timeIn, l.timeOut, feePerHour))) : 0;

  const hourlyData = useMemo(() => {
    const buckets = new Array(24).fill(0);
    logs.forEach(l => {
      const h = new Date(l.timeIn).getHours();
      if (h >= 0 && h < 24) buckets[h]++;
    });
    const max = Math.max(...buckets, 1);
    return { buckets, max };
  }, [logs]);

  const avgHours = exited.length > 0
    ? exited.reduce((s, l) => s + getParkedHours(l.timeIn, l.timeOut), 0) / exited.length
    : 0;

  const statCards = [
    { label: 'Tổng xe', value: logs.length.toString(), color: colors.primary },
    { label: 'Đã ra', value: exited.length.toString(), color: colors.success },
    { label: 'Trong bãi', value: parked.length.toString(), color: colors.warning },
    { label: 'Tổng phí', value: formatFee(totalFee), color: colors.accent },
  ];

  const hours: BarDatum[] = [];
  for (let i = 0; i < 24; i += 3) {
    const label = `${i.toString().padStart(2, '0')}h`;
    hours.push({ label, count: hourlyData.buckets[i] });
  }
  // last bucket: 23h
  if (24 % 3 !== 0) {
    hours.push({ label: '23h', count: hourlyData.buckets[23] });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        {statCards.map((item, i) => (
          <View key={i} style={[styles.statCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Text style={[styles.statValue, { color: item.color }]}>{item.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Xe vào theo giờ</Text>
      <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <BarChart data={hours} color={colors.primary} maxCount={hourlyData.max} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Thống kê phí</Text>
      <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <View style={styles.feeRow}>
          <View style={styles.feeItem}>
            <Text style={[styles.feeLabel, { color: colors.textMuted }]}>Phí trung bình</Text>
            <Text style={[styles.feeValue, { color: colors.text }]}>{formatFee(Math.round(avgFee))}</Text>
          </View>
          <View style={styles.feeItem}>
            <Text style={[styles.feeLabel, { color: colors.textMuted }]}>Phí cao nhất</Text>
            <Text style={[styles.feeValue, { color: colors.text }]}>{formatFee(maxFee)}</Text>
          </View>
          <View style={styles.feeItem}>
            <Text style={[styles.feeLabel, { color: colors.textMuted }]}>Giờ trung bình</Text>
            <Text style={[styles.feeValue, { color: colors.text }]}>{avgHours.toFixed(1)}h</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  statsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 12,
  },
  statCard: {
    width: '48%', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '500' },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  chartCard: {
    borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 12,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
  feeItem: { alignItems: 'center', gap: 4 },
  feeLabel: { fontSize: 11, fontWeight: '500' },
  feeValue: { fontSize: 16, fontWeight: '700' },
});

export default SessionStats;
