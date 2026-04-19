import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { handleSocialAuthResult, signInWithApple, signInWithGoogle, signInWithSnapchat, signInWithTikTok } from '../../services/socialAuthService';
import { loginWithUsername } from '../../services/usernameAuthService';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import SocialButton from '@/src/_components/auth/SocialButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function UsernameLoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter your username');
      return;
    }

    setLoading(true);
    const result = await loginWithUsername(username);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)/home');
    } else {
      Alert.alert('Login Failed', result.error || 'Could not login with username');
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    await handleSocialAuthResult(result, router);
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    const result = await signInWithApple();
    await handleSocialAuthResult(result, router);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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

            {/* Username Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Enter your username</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            {/* Login Button */}
            <CustomButton
              title={loading ? 'Logging in...' : 'Login'}
              onPress={handleLogin}
              variant="primary"
              style={styles.loginButton}
              disabled={loading}
            />

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#0A3D62" />
              </View>
            )}

            {/* Social Login Options */}
            <View style={styles.socialSection}>
              <SocialButton
                provider="google"
                onPress={handleGoogleSignIn}
                style={styles.socialButton}
              />
              <SocialButton
                provider="apple"
                onPress={handleAppleSignIn}
                style={styles.socialButton}
              />
              <SocialButton
                provider="tiktok"
                onPress={signInWithTikTok}
                style={styles.socialButton}
              />
              <SocialButton
                provider="snapchat"
                onPress={signInWithSnapchat}
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
        </ScrollView>
      </KeyboardAvoidingView>
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
  loginButton: {
    marginBottom: 15,
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  socialSection: {
    marginBottom: 15,
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

