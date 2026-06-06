import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signUpUser } from '../../lib/firebaseHelpers';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import { AuthKeyboardScroll } from '@/src/_components/auth/AuthKeyboardScroll';
import CustomButton from '@/src/_components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function PasswordSignUpScreen() {
  const router = useRouter();
  const { email, username, name } = useLocalSearchParams<{
    email: string;
    username: string;
    name?: string;
  }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    setError('');

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await signUpUser(email, password, name || undefined, username);

      if (result.success) {
        // Navigate to main app
        router.replace('/(tabs)' as any);
      } else {
        const msg = result.error?.message || result.error || 'Registration failed. Please try again.';
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AuthKeyboardScroll contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => safeRouterBack()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <AuthBrandHeader subtitle="Create your password." />
          </View>


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
            {password.length > 0 && password.length < 6 && (
              <Text style={styles.hint}>Password must be at least 6 characters</Text>
            )}
          </View>

          {/* Confirm Password Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Confirm your password"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoCorrect={false}
                spellCheck={false}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirm(v => !v)}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={[styles.hint, { color: '#f44336' }]}>Passwords do not match</Text>
            )}
            {confirmPassword.length > 0 && password === confirmPassword && password.length >= 6 && (
              <Text style={[styles.hint, { color: '#4CAF50' }]}>Passwords match ✓</Text>
            )}
          </View>

          {/* Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Sign Up Button */}
          <CustomButton
            title={loading ? 'Creating account...' : 'Create Account'}
            onPress={handleSignUp}
            variant="primary"
            style={styles.signUpButton}
            loading={loading}
            disabled={loading}
          />

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Already have an account?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => router.push('/auth/login-options')}
              >
                Log in
              </Text>
            </Text>
          </View>
        </View>
      </AuthKeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 10,
  },
  header: {
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    marginBottom: 10,
  },
  inputContainer: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#000',
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
  eyeIcon: {
    position: 'absolute',
    right: 15,
    padding: 4,
  },
  hint: {
    fontSize: 12,
    color: '#FF8D00',
    marginTop: 4,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 14,
    marginBottom: 12,
  },
  signUpButton: {
    marginBottom: 15,
    marginTop: 5,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 10,
    marginTop: 'auto',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  footerLink: {
    color: '#FF8D00',
    fontWeight: '600',
  },
});
