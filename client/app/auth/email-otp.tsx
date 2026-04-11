import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logAnalyticsEvent } from '../../lib/analytics';
import CustomButton from '@/src/_components/auth/CustomButton';

export default function EmailOTPScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string || 'user@example.com';
  const phone = params.phone as string;
  const flow = params.flow as string || 'login';
  const generatedOtp = params.generatedOtp as string; // For dev/testing

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

    // Verify OTP (in dev mode, check against generated OTP)
    if (generatedOtp && otpCode !== generatedOtp) {
      setError(`Invalid OTP. Please check the console for the correct code.`);
      console.log('âŒ OTP mismatch. Expected:', generatedOtp, 'Got:', otpCode);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // For phone signup flow, create account with email and phone
      if (flow === 'signup' && email && phone) {
        const { signUpUser } = await import('../../lib/firebaseHelpers');

        // Generate password from phone number (user can change later)
        const tempPassword = `${phone.replace(/\D/g, '')}Temp!`;
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

          Alert.alert(
            'Account Created! ðŸŽ‰',
            'Your account has been created successfully. You can now login with your email.',
            [
              {
                text: 'Continue',
                onPress: () => router.replace('/(tabs)/home')
              }
            ]
          );
          logAnalyticsEvent('auth_email_otp_signup_success');
        } else {
          setError(result.error || 'Signup failed');
          logAnalyticsEvent('auth_email_otp_signup_error', { error: result.error });
        }
      } else {
        // For login flow
        Alert.alert(
          'Verification Successful! âœ…',
          'You have been logged in successfully.',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/(tabs)/home')
            }
          ]
        );
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
      // Generate new OTP
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      console.log('ðŸ“± Resent OTP:', newOtp, 'for email:', email);

      // TODO: In production, send this OTP via SMS or email service

      Alert.alert(
        'OTP Resent! âœ…',
        `A new verification code has been generated. Check the console for the code.`,
        [{ text: 'OK' }]
      );
      setOtp(['', '', '', '', '', '']);
      setError('');
      inputRefs.current[0]?.focus();
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      Alert.alert('Error', 'Failed to resend OTP. Please try again.');
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
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>Enter verification code</Text>
              <Text style={styles.subtitle}>
                Please enter the 6-digit code sent to {email}
              </Text>
            </View>

            {/* Email Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail" size={40} color="#0A3D62" />
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
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
    borderColor: '#0A3D62',
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
    color: '#0A3D62',
    fontWeight: '600',
  },
});

