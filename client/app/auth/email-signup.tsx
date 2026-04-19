import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signUpUser } from '../../lib/firebaseHelpers';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import SocialButton from '@/src/_components/auth/SocialButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function EmailSignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleNext = async () => {
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
      // Use email username as name for now
      const username = email.split('@')[0];

      // Enable email verification (send verification email)
      const result = await signUpUser(email, password, username);

      if (result.success) {
        // Account created - email verification sent (but not required to login)
        Alert.alert(
          'Account Created! ðŸŽ‰',
          'Your account has been created successfully. A verification email has been sent (optional). You can start using the app now!',
          [
            {
              text: 'Get Started',
              onPress: () => router.replace('/(tabs)/home')
            }
          ]
        );
      } else {
        setError(result.error || 'Sign up failed');
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
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
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
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
              <AuthBrandHeader subtitle={`Let's keep it quick, 2 steps and you're in.`} />
            </View>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>By Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Enter password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {/* Error Message */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {/* Next Button */}
            <CustomButton
              title={loading ? "Creating account..." : "Next"}
              onPress={handleNext}
              variant="primary"
              style={styles.nextButton}
              loading={loading}
              disabled={loading}
            />

            {/* Social Login Options */}
            <View style={styles.socialSection}>
              <SocialButton
                provider="google"
                onPress={() => router.push('/auth/welcome')}
                style={styles.socialButton}
              />
              <SocialButton
                provider="apple"
                onPress={() => router.push('/auth/welcome')}
                style={styles.socialButton}
              />
              <SocialButton
                provider="tiktok"
                onPress={() => router.push('/auth/welcome')}
                style={styles.socialButton}
              />
              <SocialButton
                provider="snapchat"
                onPress={() => router.push('/auth/welcome')}
                style={styles.socialButton}
              />
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                You have an account?{' '}
                <Text
                  style={styles.footerLink}
                  onPress={() => router.push('/auth/login-options')}
                >
                  Log in
                </Text>
              </Text>
            </View>
          </Animated.View>
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
  nextButton: {
    marginBottom: 15,
    marginTop: 5,
  },
  socialSection: {
    marginBottom: 15,
  },
  socialButton: {
    marginBottom: 8,
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
    color: '#0A3D62',
    fontWeight: '600',
  },
});

