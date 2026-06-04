import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { getSession, logout, verifySessionOnSupabase, getSettingBool } from '../utils/databaseHelper';

const logo = require('../assets/logo.png');

function SplashScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const granted = await getSettingBool('permissions_granted');
        if (granted) {
          const session = await getSession();
          if (session) {
            const exists = await verifySessionOnSupabase();
            if (exists) {
              login(session.id, session.fullName);
              navigation.replace('Home');
              return;
            }
            await logout();
            Alert.alert('Tài khoản chưa tồn tại', 'Tài khoản của bạn đã bị xóa khỏi hệ thống. Vui lòng đăng ký tài khoản mới.');
            navigation.replace('Login');
            return;
          }
          navigation.replace('Login');
          return;
        }
        navigation.replace('Permission');
      } catch {
        navigation.replace('Login');
      }
    })();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
      <Text style={[styles.title, { color: colors.text }]}>s.p.a</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Nhận diện biển số xe</Text>
      <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 100, height: 100, marginBottom: 20 },
  title: { fontSize: 36, fontWeight: '700', letterSpacing: 1 },
  subtitle: { fontSize: 16, marginTop: 8 },
  loader: { marginTop: 24 },
});

export default SplashScreen;
