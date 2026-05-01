import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserErrorMessage } from '../../lib/errorHandler';
import { signInUser } from '../../lib/firebaseHelpers';
import { handleSocialAuthResult, signInWithApple, signInWithGoogle, signInWithSnapchat, signInWithTikTok } from '../../services/socialAuthService';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import { AuthKeyboardScroll } from '@/src/_components/auth/AuthKeyboardScroll';
import CustomButton from '@/src/_components/auth/CustomButton';
import SocialButton from '@/src/_components/auth/SocialButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function EmailLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');

    // Validation
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const result = await signInUser(email, password);
      console.log('[Login] Result:', result);

      if (result.success) {
        console.log('[Login] âœ… Success - waiting for token save');
        // Wait a moment for AsyncStorage to sync
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify token was saved
        const token = await AsyncStorage.getItem('token');
        const userId = await AsyncStorage.getItem('userId');
        console.log('[Login] Token saved?', !!token, 'userId saved?', !!userId);

        // Successfully logged in - navigate to home
        console.log('[Login] About to navigate to home screen');

        // Use setTimeout to ensure navigation happens after state updates
        setTimeout(() => {
          try {
            router.replace('/(tabs)/home');
            console.log('[Login] Navigation called successfully');
          } catch (e) {
            console.error('[Login] Navigation error:', e);
            // Fallback: try alternative navigation path
            router.push('/(tabs)/home');
          }
        }, 100);
      } else {
        console.log('[Login] âŒ Failed:', result.error);
        setError(getUserErrorMessage(result.error || 'Login failed'));
        setLoading(false);
      }
    } catch (err: any) {
      console.error('[Login] Error:', err);
      setError(getUserErrorMessage(err));
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'tiktok' | 'snapchat') => {
    setLoading(true);
    setError('');
    try {
      let result;
      if (provider === 'google') {
        result = await signInWithGoogle();
      } else if (provider === 'apple') {
        result = await signInWithApple();
      } else if (provider === 'tiktok') {
        result = await signInWithTikTok();
      } else if (provider === 'snapchat') {
        result = await signInWithSnapchat();
      }

      if (result && result.success) {
        // Handle social auth result (create user profile if needed)
        await handleSocialAuthResult(result.user, provider);
        router.replace('/(tabs)/home');
      } else {
        setError(getUserErrorMessage(result?.error || 'Login failed'));
      }
    } catch (err: any) {
      console.error(`${provider} login error:`, err);
      setError(getUserErrorMessage(err));
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

            {/* Title Section */}
            <View style={styles.titleSection}>
              <AuthBrandHeader subtitle="Please login to your account" />
            </View>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Enter your email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            {/* Error Message */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {/* Forgot Password */}
            <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
              <Text style={styles.forgotPassword}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <CustomButton
              title={loading ? "Logging in..." : "Login"}
              onPress={handleLogin}
              variant="primary"
              style={styles.loginButton}
              loading={loading}
              disabled={loading}
            />

            {/* Social Login Options */}
            <View style={styles.socialSection}>
              <SocialButton
                provider="google"
                onPress={() => handleSocialLogin('google')}
                style={styles.socialButton}
              />
              <SocialButton
                provider="apple"
                onPress={() => handleSocialLogin('apple')}
                style={styles.socialButton}
              />
              <SocialButton
                provider="tiktok"
                onPress={() => handleSocialLogin('tiktok')}
                style={styles.socialButton}
              />
              <SocialButton
                provider="snapchat"
                onPress={() => handleSocialLogin('snapchat')}
                style={styles.socialButton}
              />
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Don&apos;t have an account?{' '}
                <Text
                  style={styles.footerLink}
                  onPress={() => router.push('/auth/signup-options')}
                >
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
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
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
    marginBottom: 15,
  },
  inputContainer: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#000',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 14,
    marginBottom: 12,
  },
  forgotPassword: {
    fontSize: 14,
    color: '#0A3D62',
    marginBottom: 20,
  },
  loginButton: {
    marginBottom: 15,
  },
  socialSection: {
    marginBottom: 10,
  },
  socialButton: {
    marginBottom: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingBottom: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  footerLink: {
    color: '#0A3D62',
    fontWeight: '600',
  },
});

