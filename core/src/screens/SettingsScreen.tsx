import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, StatusBar, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { ThemeColors } from '../theme/colors';
import Icon from '../theme/Icon';
import { getSettingBool, setSettingBool, getSettingInt, setSettingInt } from '../utils/databaseHelper';

function SettingsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { attendantName, deleteAccount } = useAuth();

  const [vibEnabled, setVibEnabled] = useState(true);
  const [vibDuration, setVibDuration] = useState(100);
  const [sndEnabled, setSndEnabled] = useState(true);
  const [sndVolume, setSndVolume] = useState(80);
  const [showCharBboxes, setShowCharBboxes] = useState(false);

  function confirmDelete() {
    Alert.alert(
      'Xóa tài khoản',
      'Bạn có chắc chắn muốn xóa tài khoản? Toàn bộ dữ liệu sẽ bị xóa và không thể khôi phục.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa tài khoản', style: 'destructive', onPress: () => deleteAccount() },
      ],
    );
  }

  useEffect(() => {
    (async () => {
      const [vib, snd, v, s, charBbox] = await Promise.all([
        getSettingBool('vibration_enabled'),
        getSettingBool('sound_enabled'),
        getSettingInt('vibration_duration'),
        getSettingInt('sound_volume'),
        getSettingBool('show_char_bboxes'),
      ]);
      setVibEnabled(vib !== false);
      setSndEnabled(snd !== false);
      if (v !== null) setVibDuration(v);
      if (s !== null) setSndVolume(s);
      setShowCharBboxes(charBbox === true);
    })();
  }, []);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <View style={[s.header, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.text }]}>Cài đặt</Text>
        <View style={s.backBtn} />
      </View>

      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>TÀI KHOẢN</Text>
        <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('ResetPassword', { initialEmail: attendantName })}>
            <View style={s.rowLeft}>
              <Icon name="lock" size={20} color={colors.primary} />
              <Text style={[s.rowLabel, { color: colors.text }]}>Đặt lại mật khẩu</Text>
            </View>
            <Icon name="chevron" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={[s.divider, { backgroundColor: colors.borderLight }]} />
          <TouchableOpacity style={s.row} onPress={confirmDelete}>
            <View style={s.rowLeft}>
              <Icon name="delete" size={20} color={colors.danger} />
              <Text style={[s.rowLabel, { color: colors.danger }]}>Xóa tài khoản</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>RUNG & ÂM THANH</Text>
        <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <RowItem
            colors={colors}
            icon={<Icon name="bell" size={20} color={colors.primary} />}
            label="Rung"
            control={
              <Switch
                value={vibEnabled}
                onValueChange={async (v) => { setVibEnabled(v); await setSettingBool('vibration_enabled', v); }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          {vibEnabled && (
            <View style={[s.sliderRow, { borderTopColor: colors.borderLight }]}>
              <Text style={[s.sliderLabel, { color: colors.textSecondary }]}>Nhẹ</Text>
              <Slider
                style={s.slider}
                minimumValue={30}
                maximumValue={300}
                step={10}
                value={vibDuration}
                onValueChange={v => setVibDuration(v)}
                onSlidingComplete={async v => await setSettingInt('vibration_duration', v)}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
              <Text style={[s.sliderLabel, { color: colors.textSecondary }]}>Mạnh</Text>
            </View>
          )}
          <View style={[s.divider, { backgroundColor: colors.borderLight }]} />
          <RowItem
            colors={colors}
            icon={<Icon name="volume" size={20} color={colors.primary} />}
            label="Âm thanh"
            control={
              <Switch
                value={sndEnabled}
                onValueChange={async (v) => { setSndEnabled(v); await setSettingBool('sound_enabled', v); }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          {sndEnabled && (
            <View style={[s.sliderRow, { borderTopColor: colors.borderLight }]}>
              <Text style={[s.sliderLabel, { color: colors.textSecondary }]}>Nhỏ</Text>
              <Slider
                style={s.slider}
                minimumValue={0}
                maximumValue={100}
                step={5}
                value={sndVolume}
                onValueChange={v => setSndVolume(v)}
                onSlidingComplete={async v => await setSettingInt('sound_volume', v)}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
              <Text style={[s.sliderLabel, { color: colors.textSecondary }]}>To</Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>HIỂN THỊ</Text>
        <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <RowItem
            colors={colors}
            icon={<Icon name="dot" size={20} color={colors.primary} />}
            label="Bounding box ký tự"
            control={
              <Switch
                value={showCharBboxes}
                onValueChange={async (v) => { setShowCharBboxes(v); await setSettingBool('show_char_bboxes', v); }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </View>
      </View>
    </View>
  );
}

function RowItem({ colors, icon, label, control }: { colors: ThemeColors; icon: React.ReactNode; label: string; control: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        {icon}
        <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
      </View>
      {control}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  slider: { flex: 1, height: 40 },
  sliderLabel: { fontSize: 12, fontWeight: '600', minWidth: 30, textAlign: 'center' },
  divider: { height: 1, marginHorizontal: 16 },
});

export default SettingsScreen;
