import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logAnalyticsEvent } from '../../lib/analytics';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import { AuthKeyboardScroll } from '@/src/_components/auth/AuthKeyboardScroll';
import CustomButton from '@/src/_components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function EmailOTPScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string || 'user@example.com';
  const phone = params.phone as string;
  const flow = params.flow as string || 'login';
  const target = (email || phone || '').trim();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    logAnalyticsEvent('auth_email_otp_open', { flow });
  }, []);

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.slice(0, 6).split('');
      const newOtp = [...otp];
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newOtp[index + i] = digit;
        }
      });
      setOtp(newOtp);
      
      // Focus last filled input
      const lastIndex = Math.min(index + digits.length - 1, 5);
      inputRefs.current[lastIndex]?.focus();
    } else {
      // Single digit
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);

      // Auto-focus next input
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    logAnalyticsEvent('auth_email_otp_verify_click');
    const otpCode = otp.join('');

    if (otpCode.length !== 6) {
      setError('Please enter complete OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verify OTP securely via backend
      const { apiService } = await import('@/src/_services/apiService');
      const verifyRes = await apiService.post('/auth/verify-otp', {
        email: target.includes('@') ? target : undefined,
        phone: !target.includes('@') ? target : undefined,
        code: otpCode
      });

      if (!verifyRes?.success) {
        setError(verifyRes?.error || 'Invalid OTP code');
        setLoading(false);
        return;
      }

      // For phone signup flow, create account with email and phone
      if (flow === 'signup' && email && phone) {
        const { signUpUser } = await import('../../lib/firebaseHelpers');

        // Generate secure random password (user will use email/OTP or reset password link)
        const randomSalt = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
        const tempPassword = `Sec!${randomSalt.toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}#`;
        const username = email.split('@')[0];

        // Create account (skip email verification since we're using OTP)
        const result = await signUpUser(email, tempPassword, username);

        if (result.success) {
          // Store phone number in user profile
          const { updateUserProfile } = await import('../../lib/firebaseHelpers');
          const { auth } = await import('../../config/firebase');
          const user = auth?.currentUser;

          if (user) {
            await updateUserProfile(user.uid, { phoneNumber: phone });
          }

          router.replace('/(tabs)/home');
          logAnalyticsEvent('auth_email_otp_signup_success');
        } else {
          setError(result.error || 'Signup failed');
          logAnalyticsEvent('auth_email_otp_signup_error', { error: result.error });
        }
      } else {
        // Login flow - OTP verified, continue
        router.replace('/(tabs)/home');
        logAnalyticsEvent('auth_email_otp_verify_success');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
      logAnalyticsEvent('auth_email_otp_verify_error', { message: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    logAnalyticsEvent('auth_email_otp_resend');
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const res = await apiService.post('/auth/send-otp', {
        email: target.includes('@') ? target : undefined,
        phone: !target.includes('@') ? target : undefined
      });
      if (res?.success) {
        Alert.alert(
          'OTP Resent! ✅',
          `A new verification code has been sent to ${target}.`,
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(res?.error || 'Failed to resend OTP');
      }
      setOtp(['', '', '', '', '', '']);
      setError('');
      inputRefs.current[0]?.focus();
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      Alert.alert('Error', error.message || 'Failed to resend OTP. Please try again.');
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
              <AuthBrandHeader
                title="Enter verification code"
                subtitle={`Please enter the 6-digit code sent to ${email}`}
              />
            </View>

            {/* Email Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail" size={40} color="#FF8D00" />
              </View>
              <Text style={styles.iconText}>Check your email inbox</Text>
            </View>

            {/* OTP Input */}
            <View style={styles.otpContainer}>
              <Text style={styles.label}>Enter your OTP</Text>
              <View style={styles.otpInputRow}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => { inputRefs.current[index] = ref; }}
                    style={[
                      styles.otpInput,
                      digit && styles.otpInputFilled,
                    ]}
                    value={digit}
                    onChangeText={(value) => handleOtpChange(value, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    autoCorrect={false}
                    autoFocus={index === 0}
                  />
                ))}
              </View>
              
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {/* Verify Button */}
            <CustomButton
              title="Verify"
              onPress={handleVerify}
              loading={loading}
              variant="primary"
              style={styles.verifyButton}
            />

            {/* Resend Code */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn&apos;t receive the code? </Text>
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendLink}>Resend</Text>
              </TouchableOpacity>
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
    padding: 15,
    paddingBottom: 10,
  },
  header: {
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  titleSection: {
    marginBottom: 15,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff5e6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconText: {
    fontSize: 14,
    color: '#666',
  },
  otpContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  otpInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  otpInput: {
    width: 50,
    height: 56,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
    backgroundColor: '#fff',
  },
  otpInputFilled: {
    borderColor: '#FF8D00',
    backgroundColor: '#fff5e6',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 8,
  },
  verifyButton: {
    marginBottom: 15,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    color: '#666',
  },
  resendLink: {
    fontSize: 14,
    color: '#FF8D00',
    fontWeight: '600',
  },
});

