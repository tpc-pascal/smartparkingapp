import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import GlassCard from '../components/GlassCard';

interface HomeScreenProps {
  onNavigate: (screen: 'Entry' | 'Exit') => void;
}

function HomeScreen({ onNavigate }: HomeScreenProps) {
  useEffect(() => {
    console.log('[HOME] HomeScreen mounted');
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

      <View style={styles.header}>
        <Text style={styles.logo}>🚗</Text>
        <Text style={styles.title}>SmartParking</Text>
        <Text style={styles.subtitle}>Bảng điều khiển</Text>
      </View>

      <View style={styles.statsRow}>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Xe vào</Text>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Xe ra</Text>
        </GlassCard>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.entryButton]}
          onPress={() => {
            console.log('[HOME] User pressed "Quét xe vào"');
            onNavigate('Entry');
          }}>
          <Text style={styles.actionIcon}>📥</Text>
          <Text style={styles.actionText}>Quét xe vào</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.exitButton]}
          onPress={() => {
            console.log('[HOME] User pressed "Quét xe ra"');
            onNavigate('Exit');
          }}>
          <Text style={styles.actionIcon}>📤</Text>
          <Text style={styles.actionText}>Quét xe ra</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 24,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
  },
  buttonRow: {
    gap: 16,
    flex: 1,
    justifyContent: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderRadius: 20,
    gap: 12,
  },
  entryButton: {
    backgroundColor: 'rgba(74, 144, 217, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.4)',
  },
  exitButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.4)',
  },
  actionIcon: {
    fontSize: 28,
  },
  actionText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default HomeScreen;
