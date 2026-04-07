import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
} from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import { getSession, setSettingBool } from '../utils/databaseHelper';

function PermissionScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();
  const { requestPermission } = useCameraPermission();

  const [cameraGranted, setCameraGranted] = React.useState(false);

  React.useEffect(() => {
    if (cameraGranted) {
      (async () => {
        try { await setSettingBool('permissions_granted', true); } catch {}
        const session = await getSession();
        if (session) {
          login(session.id, session.fullName);
          navigation.replace('Home');
          return;
        }
        navigation.replace('Login');
      })();
    }
  }, [cameraGranted, login, navigation]);

  async function handleGrantCamera() {
    const granted = await requestPermission();
    if (granted) setCameraGranted(true);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Yêu cầu thiết lập</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Vui lòng cấp quyền camera để tiếp tục
      </Text>

      <GlassCard style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <Text style={styles.cardIcon}>{cameraGranted ? '✅' : '📷'}</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Camera</Text>
        <Text style={[styles.cardDesc, { color: colors.textMuted }]}>Nhận diện biển số xe</Text>
        {cameraGranted ? (
          <Text style={[styles.statusDone, { color: colors.success }]}>✓ Đã cấp quyền</Text>
        ) : (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={handleGrantCamera} activeOpacity={0.7}>
            <Text style={styles.actionBtnText}>Cấp quyền</Text>
          </TouchableOpacity>
        )}
      </GlassCard>

      {!cameraGranted && (
        <TouchableOpacity style={styles.exitBtn} onPress={() => BackHandler.exitApp()} activeOpacity={0.7}>
          <Text style={[styles.exitBtnText, { color: colors.textMuted }]}>Thoát</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, marginBottom: 28, textAlign: 'center' },
  card: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 12, marginBottom: 28 },
  cardIcon: { fontSize: 36, marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardDesc: { fontSize: 12, marginBottom: 14, textAlign: 'center' },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  statusDone: { fontSize: 14, fontWeight: '700' },
  exitBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  exitBtnText: { fontSize: 15, fontWeight: '500' },
});

export default PermissionScreen;
