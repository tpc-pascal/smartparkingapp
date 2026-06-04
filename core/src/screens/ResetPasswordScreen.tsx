import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import GlassCard from '../components/GlassCard';
import Icon from '../theme/Icon';
import { sendResetCode, verifyResetCode } from '../utils/databaseHelper';

function ResetPasswordScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ResetPassword'>>();
  const initialEmail = route.params?.initialEmail;
  const codeRef = useRef<TextInput>(null);

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(initialEmail || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    if (!email.trim()) { Alert.alert('Thông báo', 'Vui lòng nhập email'); return; }
    setLoading(true);
    try {
      await sendResetCode(email.trim());
      Alert.alert('Đã gửi mã', 'Vui lòng kiểm tra email');
      setStep(2);
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Email không tồn tại trên hệ thống');
    } finally { setLoading(false); }
  }

  async function handleVerifyCode() {
    if (!code.trim() || code.length !== 4) { Alert.alert('Thông báo', 'Vui lòng nhập mã xác thực 4 số'); return; }
    setLoading(true);
    try {
      await verifyResetCode(email.trim(), code.trim(), null);
      setStep(3);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Mã xác thực không đúng');
    } finally { setLoading(false); }
  }

  async function handleSetNewPassword() {
    if (!newPassword.trim() || newPassword.length < 6) { Alert.alert('Thông báo', 'Mật khẩu mới phải có ít nhất 6 ký tự'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Thông báo', 'Mật khẩu xác nhận không khớp'); return; }
    setLoading(true);
    try {
      await verifyResetCode(email.trim(), code.trim(), newPassword);
      Alert.alert('Thành công', 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể đặt lại mật khẩu');
    } finally { setLoading(false); }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {step === 1 ? 'Quên mật khẩu' : step === 2 ? 'Nhập mã xác thực' : 'Đặt mật khẩu mới'}
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {step === 1
              ? 'Nhập email đã đăng ký để nhận mã'
              : step === 2
              ? `Mã 4 số đã gửi đến ${email}`
              : 'Nhập mật khẩu mới cho tài khoản của bạn'}
          </Text>
        </View>

        <GlassCard style={styles.form}>
          {step === 1 && (
            <>
              <View style={[styles.inputWrap, { borderColor: colors.inputBorder }]}>
                <Icon name="mail" size={18} color={colors.textMuted} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email của bạn"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]} onPress={handleSendCode} disabled={loading} activeOpacity={0.7}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Gửi mã</Text>}
              </TouchableOpacity>
            </>
          )}

          {step === 2 && (
            <>
              <View style={[styles.codeRow, { borderColor: colors.inputBorder }]}>
                <TextInput
                  ref={codeRef}
                  style={[styles.codeInput, { color: colors.text }]}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="0000"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <TouchableOpacity style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]} onPress={handleVerifyCode} disabled={loading} activeOpacity={0.7}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Xác nhận</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.resendBtn} onPress={handleSendCode} disabled={loading}>
                <Text style={[styles.resendText, { color: colors.primary }]}>Gửi lại mã</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 3 && (
            <>
              <View>
                <View style={[styles.inputWrap, { borderColor: colors.inputBorder }]}>
                  <Icon name="lock" size={18} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Mật khẩu mới"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showNewPwd}
                  />
                </View>
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNewPwd(!showNewPwd)}>
                  <View style={[eyeStyle.eye, { borderColor: colors.textMuted }]}>
                    <View style={[eyeStyle.pupil, { backgroundColor: colors.textMuted }]} />
                    {showNewPwd && <View style={[eyeStyle.line, { backgroundColor: colors.textMuted }]} />}
                  </View>
                </TouchableOpacity>
              </View>
              <View>
                <View style={[styles.inputWrap, { borderColor: colors.inputBorder }]}>
                  <Icon name="lock" size={18} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Xác nhận mật khẩu mới"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showConfirmPwd}
                  />
                </View>
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmPwd(!showConfirmPwd)}>
                  <View style={[eyeStyle.eye, { borderColor: colors.textMuted }]}>
                    <View style={[eyeStyle.pupil, { backgroundColor: colors.textMuted }]} />
                    {showConfirmPwd && <View style={[eyeStyle.line, { backgroundColor: colors.textMuted }]} />}
                  </View>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]} onPress={handleSetNewPassword} disabled={loading} activeOpacity={0.7}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Đặt lại</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={[styles.backLinkText, { color: colors.primary }]}>Quay lại</Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 30, fontWeight: '800' },
  hint: { fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  form: { padding: 20, gap: 14 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  submitButton: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  buttonDisabled: { opacity: 0.5 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  backLink: { marginTop: 8, alignItems: 'center' },
  backLinkText: { fontSize: 14, fontWeight: '600' },
  codeRow: {
    alignItems: 'center', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  codeInput: { fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 8, paddingVertical: 4 },
  eyeBtn: { position: 'absolute', right: 10, zIndex: 10, padding: 4, top: 10 },
  resendBtn: { alignItems: 'center', marginTop: -4 },
  resendText: { fontSize: 13, fontWeight: '600' },
});

const eyeStyle = StyleSheet.create({
  eye: { width: 22, height: 16, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  pupil: { width: 6, height: 6, borderRadius: 3 },
  line: { position: 'absolute', width: 26, height: 2, transform: [{ rotate: '45deg' }] },
});

export default ResetPasswordScreen;
