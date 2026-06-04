import React, { useState, useCallback } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import Icon from '../theme/Icon';
import { loginAttendant, registerAttendant } from '../utils/databaseHelper';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState('');

  const clearErrors = useCallback(() => {
    setFieldErrors({});
    setServerError('');
  }, []);

  const validate = useCallback((): boolean => {
    setServerError('');
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Vui lòng nhập email';
    } else if (mode === 'register' && !EMAIL_RE.test(email.trim())) {
      errors.email = 'Email không hợp lệ';
    }
    if (!password.trim()) {
      errors.password = 'Vui lòng nhập mật khẩu';
    } else if (mode === 'register' && password.length < 6) {
      errors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    }
    if (mode === 'register' && password !== confirmPassword) {
      errors.password = 'Mật khẩu xác nhận không khớp';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password, confirmPassword, mode]);

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setServerError('');
    try {
      if (mode === 'login') {
        const result = await loginAttendant(email.trim(), password);
        login(result.id, result.fullName);
        navigation.replace('Home');
      } else {
        await registerAttendant(email.trim(), password);
        Alert.alert('Thành công', `Đã đăng ký tài khoản ${email.trim()}`);
        setMode('login');
      }
    } catch (err: any) {
      if (err.code === 'EMAIL_EXISTS') {
        Alert.alert('Thông báo', err.message, [
          { text: 'Đăng nhập', onPress: () => setMode('login') }
        ]);
      } else {
        setServerError(err.message || 'Đã có lỗi xảy ra');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </Text>
        </View>

        <GlassCard style={styles.form}>
          {serverError ? (
            <View style={styles.serverErrorBox}>
              <Text style={styles.serverErrorText}>{serverError}</Text>
            </View>
          ) : null}

          <View style={[styles.inputWrap, { borderColor: fieldErrors.email ? colors.danger : colors.inputBorder }]}>
            <Icon name="mail" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={email}
              onChangeText={(t) => { setEmail(t); clearErrors(); }}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View>
            <View style={[styles.inputWrap, { borderColor: fieldErrors.password ? colors.danger : colors.inputBorder }]}>
              <Icon name="lock" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={password}
                onChangeText={(t) => { setPassword(t); clearErrors(); }}
                placeholder="Mật khẩu"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
              />
            </View>
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              <View style={[eyeStyle.eye, { borderColor: colors.textMuted }]}>
                <View style={[eyeStyle.pupil, { backgroundColor: colors.textMuted }]} />
                {showPassword && <View style={[eyeStyle.line, { backgroundColor: colors.textMuted }]} />}
              </View>
            </TouchableOpacity>
          </View>

          {mode === 'login' && (
            <TouchableOpacity style={styles.forgotBtn} onPress={() => navigation.navigate('ResetPassword', { initialEmail: email.trim() })}>
              <Text style={[styles.forgotText, { color: colors.primary }]}>Quên mật khẩu?</Text>
            </TouchableOpacity>
          )}

          {mode === 'register' && (
            <View>
              <View style={[styles.inputWrap, { borderColor: fieldErrors.password ? colors.danger : colors.inputBorder }]}>
                <Icon name="lock" size={18} color={colors.textMuted} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={confirmPassword}
                  onChangeText={(t) => { setConfirmPassword(t); clearErrors(); }}
                  placeholder="Xác nhận mật khẩu"
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
          )}

          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </Text>
            )}
          </TouchableOpacity>
        </GlassCard>

        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setFieldErrors({});
            setServerError('');
            setConfirmPassword('');
          }}
        >
          <Text style={[styles.toggleText, { color: colors.primary }]}>
            {mode === 'login'
              ? 'Chưa có tài khoản? Đăng ký'
              : 'Đã có tài khoản? Đăng nhập'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 30, fontWeight: '800' },
  form: { padding: 20, gap: 14 },
  serverErrorBox: {
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
  },
  serverErrorText: { color: '#DC2626', fontSize: 13, textAlign: 'center', lineHeight: 18 },
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
  eyeBtn: { position: 'absolute', right: 10, zIndex: 10, padding: 4, top: 10 },
  forgotBtn: { alignItems: 'flex-end', marginTop: -4 },
  forgotText: { fontSize: 13, fontWeight: '600' },
  submitButton: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  buttonDisabled: { opacity: 0.5 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  toggleButton: { marginTop: 20, alignItems: 'center' },
  toggleText: { fontSize: 14 },
});

const eyeStyle = StyleSheet.create({
  eye: { width: 22, height: 16, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  pupil: { width: 6, height: 6, borderRadius: 3 },
  line: { position: 'absolute', width: 26, height: 2, transform: [{ rotate: '45deg' }] },
});

export default LoginScreen;
