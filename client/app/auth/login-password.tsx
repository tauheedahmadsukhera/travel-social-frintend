import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@/lib/storage';
import { getUserErrorMessage } from '../../lib/errorHandler';
import { signInUser } from '../../lib/firebaseHelpers';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import { AuthKeyboardScroll } from '@/src/_components/auth/AuthKeyboardScroll';
import CustomButton from '@/src/_components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { apiService } from '@/src/_services/apiService';

export default function LoginPasswordScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEmail = identifier?.includes('@');

  const handleLogin = async () => {
    setError('');

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      let emailToUse = identifier?.trim() || '';

      // If username, resolve to email via backend
      if (!isEmail) {
        try {
          const res = await apiService.get(`/auth/email-by-username?username=${encodeURIComponent(emailToUse)}`);
          if (res?.email) {
            emailToUse = res.email;
          } else {
            setError('No account found with this username');
            setLoading(false);
            return;
          }
        } catch {
          setError('No account found with this username');
          setLoading(false);
          return;
        }
      }

      const result = await signInUser(emailToUse, password);

      if (result.success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const token = await AsyncStorage.getItem('token');
        const userId = await AsyncStorage.getItem('userId');
        if (token && userId) {
          setTimeout(() => {
            try {
              router.replace('/(tabs)/home');
            } catch {
              router.push('/(tabs)/home');
            }
          }, 100);
        }
      } else {
        setError(getUserErrorMessage(result.error || 'Login failed'));
        setLoading(false);
      }
    } catch (err: any) {
      setError(getUserErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AuthKeyboardScroll contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <AuthBrandHeader subtitle="Enter your password." />
          </View>


          {/* Password Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                spellCheck={false}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(v => !v)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Error */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Forgot Password */}
          <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
            <Text style={styles.forgotPassword}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <CustomButton
            title={loading ? 'Logging in...' : 'Login'}
            onPress={handleLogin}
            variant="primary"
            style={styles.loginButton}
            loading={loading}
            disabled={loading}
          />

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don't have an account?{' '}
              <Text style={styles.footerLink} onPress={() => router.push('/auth/signup-options')}>
                Sign up
              </Text>
            </Text>
          </View>
        </View>
      </AuthKeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, padding: 20, paddingBottom: 10 },
  header: { marginBottom: 10 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleSection: { marginBottom: 10 },
  inputContainer: { marginBottom: 12 },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#000',
  },
  inputLocked: {
    backgroundColor: '#ececec',
    color: '#555',
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 48,
  },
  eyeIcon: { position: 'absolute', right: 15, padding: 4 },
  errorText: { color: '#e74c3c', fontSize: 14, marginBottom: 10 },
  forgotPassword: { fontSize: 14, color: '#FF8D00', marginBottom: 16 },
  loginButton: { marginBottom: 15, marginTop: 5 },
  footer: { alignItems: 'center', paddingBottom: 10, marginTop: 'auto' },
  footerText: { fontSize: 14, color: '#666' },
  footerLink: { color: '#FF8D00', fontWeight: '600' },
});
