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

export default function SignUpOptionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

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

  const handleTikTokSignIn = async () => {
    setLoading(true);
    const result = await signInWithTikTok();
    await handleSocialAuthResult(result, router);
    setLoading(false);
  };

  const handleSnapchatSignIn = async () => {
    setLoading(true);
    const result = await signInWithSnapchat();
    await handleSocialAuthResult(result, router);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
            <AuthBrandHeader subtitle="Start your journey." />
          </View>

          {/* Method Selection */}
          <View style={styles.methodContainer}>
            {/* Email Input */}
            <TextInput
              style={styles.emailInput}
              placeholder="Please enter your email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />

            <CustomButton
              title="Next"
              onPress={() => router.push({ pathname: '/auth/email-signup', params: { prefillEmail: email } })}
              variant="primary"
              style={styles.methodButton}
              textStyle={styles.methodButtonText}
            />

            {/* You have an account - right below Email */}
            <Text style={styles.noAccountText}>
              Already have an account?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => router.push('/auth/login-options')}
              >
                Log in
              </Text>
            </Text>
          </View>

          {/* Social Login Options */}
          <View style={styles.socialContainer}>
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
              onPress={handleTikTokSignIn}
              style={styles.socialButton}
            />
            <SocialButton
              provider="snapchat"
              onPress={handleSnapchatSignIn}
              style={styles.socialButton}
            />
          </View>


        </View>
      </ScrollView>
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
    marginBottom: 10,
  },
  methodContainer: {
    marginBottom: 15,
  },
  methodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
    marginTop: 8,
  },
  emailInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#000',
    marginBottom: 10,
  },
  methodButton: {
    marginBottom: 8,
  },
  methodButtonText: {
    fontSize: 15,
  },
  socialContainer: {
    marginBottom: 15,
  },
  socialButton: {
    marginBottom: 8,
  },
  noAccountText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
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
