import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { handleSocialAuthResult, signInWithApple, signInWithGoogle, signInWithSnapchat, signInWithTikTok } from '../../services/socialAuthService';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import SocialButton from '@/src/_components/auth/SocialButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function LoginOptionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
    try {
      const result = await signInWithTikTok();
      if (result.success) {
        await handleSocialAuthResult(result, router);
      }
    } catch (error) {
      console.error('TikTok sign-in error:', error);
    }
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
          {/* Balanced Header & Logo Section */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => safeRouterBack()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            
            <View style={styles.logoContainer}>
              <AuthBrandHeader subtitle="How would you like to login?" />
            </View>

            {/* Empty placeholder to balance the back button width */}
            <View style={styles.headerPlaceholder} />
          </View>

          {/* Login Method Selection */}
          <View style={styles.methodContainer}>
            <CustomButton
              title="Phone"
              onPress={() => router.push('/auth/phone-login')}
              variant="primary"
              style={styles.methodButton}
            />

            <CustomButton
              title="Email"
              onPress={() => router.push('/auth/email-login')}
              variant="primary"
              style={styles.methodButton}
            />

            <CustomButton
              title="Username"
              onPress={() => router.push('/auth/username-login')}
              variant="secondary"
              style={styles.methodButton}
            />
          </View>

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
              onPress={handleTikTokSignIn}
              style={styles.socialButton}
            />
            <SocialButton
              provider="snapchat"
              onPress={handleSnapchatSignIn}
              style={styles.socialButton}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don't have an account?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => router.push('/auth/signup-options')}
              >
                Sign up
              </Text>
            </Text>
            <Text style={{ fontSize: 12, color: '#666', textAlign: 'center', marginTop: 15 }}>
              By logging in, you agree to our{' '}
              <Text style={{ fontWeight: '600' }} onPress={() => router.push('/legal/terms' as any)}>Terms of Service</Text> and{' '}
              <Text style={{ fontWeight: '600' }} onPress={() => router.push('/legal/privacy' as any)}>Privacy Policy</Text>.
            </Text>
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
    padding: 16,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    minHeight: 50,
    width: '100%',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 24, // Shifted left to reduce space on icon side
  },
  headerPlaceholder: {
    width: 44,
  },
  methodContainer: {
    marginBottom: 15,
  },
  methodButton: {
    marginBottom: 8,
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
    color: '#FF8D00',
    fontWeight: '600',
  },
});
