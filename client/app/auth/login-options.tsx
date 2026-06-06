import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { handleSocialAuthResult, signInWithApple, signInWithGoogle, signInWithSnapchat, signInWithTikTok } from '../../services/socialAuthService';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import SocialButton from '@/src/_components/auth/SocialButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function LoginOptionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');

  const handleNext = () => {
    setError('');
    if (!identifier.trim()) {
      setError('Please enter your email or username');
      return;
    }
    router.push({
      pathname: '/auth/login-password',
      params: { identifier: identifier.trim() },
    });
  };

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'tiktok' | 'snapchat') => {
    setLoading(true);
    setError('');
    try {
      let result;
      if (provider === 'google') result = await signInWithGoogle();
      else if (provider === 'apple') result = await signInWithApple();
      else if (provider === 'tiktok') result = await signInWithTikTok();
      else result = await signInWithSnapchat();

      if (result?.success) {
        await handleSocialAuthResult(result, router);
      } else {
        setError('Social login failed. Please try again.');
      }
    } catch (err: any) {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Brand Header */}
          <AuthBrandHeader subtitle="Welcome back." />

          {/* Form */}
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="Please enter your email or username"
              placeholderTextColor="#999"
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType={identifier.includes('@') ? 'email-address' : 'default'}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              editable={!loading}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <CustomButton
              title="Next"
              onPress={handleNext}
              variant="primary"
              style={styles.nextButton}
              disabled={loading}
            />

            <Text style={styles.noAccountText}>
              Don't have an account?{' '}
              <Text style={styles.footerLink} onPress={() => router.push('/auth/signup-options')}>
                Sign up
              </Text>
            </Text>
          </View>

          {/* Social Login */}
          <View style={styles.socialSection}>
            <SocialButton provider="google" onPress={() => handleSocialLogin('google')} style={styles.socialButton} />
            <SocialButton provider="apple" onPress={() => handleSocialLogin('apple')} style={styles.socialButton} />
            <SocialButton provider="tiktok" onPress={() => handleSocialLogin('tiktok')} style={styles.socialButton} />
            <SocialButton provider="snapchat" onPress={() => handleSocialLogin('snapchat')} style={styles.socialButton} />
          </View>
        </View>
      </ScrollView>

      {/* Terms Footer */}
      <View style={styles.footer}>
        <Text style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
          By logging in, you agree to our{' '}
          <Text style={{ fontWeight: '600' }} onPress={() => router.push('/legal/terms' as any)}>Terms of Service</Text> and{' '}
          <Text style={{ fontWeight: '600' }} onPress={() => router.push('/legal/privacy' as any)}>Privacy Policy</Text>.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, padding: 20, paddingBottom: 80 },
  header: { marginBottom: 10 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  formContainer: { marginTop: 15, marginBottom: 15 },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#000',
    marginBottom: 12,
  },
  errorText: { color: '#e74c3c', fontSize: 14, marginBottom: 10 },
  nextButton: { marginBottom: 14 },
  noAccountText: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 4 },
  socialSection: { marginBottom: 15 },
  socialButton: { marginBottom: 8 },
  footer: { position: 'absolute', bottom: 20, left: 20, right: 20, alignItems: 'center' },
  footerLink: { color: '#FF8D00', fontWeight: '600' },
});
