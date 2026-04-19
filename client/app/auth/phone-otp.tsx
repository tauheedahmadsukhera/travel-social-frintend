import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logAnalyticsEvent } from '../../lib/analytics';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function PhoneOTPScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const phone = params.phone as string || '+91XXXXXXXXXX';
  const flow = params.flow as string || 'login';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    logAnalyticsEvent('auth_phone_otp_open', { flow });
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
    logAnalyticsEvent('auth_phone_otp_verify_click');
    const otpCode = otp.join('');
    
    if (otpCode.length !== 6) {
      setError('Please enter complete OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // TODO: Verify OTP with backend
      // For demo, we'll simulate verification
      // In production, this would verify the OTP against backend
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Instagram-like: no success popup, just continue
      router.replace('/(tabs)/home');
      logAnalyticsEvent('auth_phone_otp_verify_success');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
      logAnalyticsEvent('auth_phone_otp_verify_error', { message: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    logAnalyticsEvent('auth_phone_otp_resend');
    Alert.alert(
      'OTP Resent! âœ…', 
      `A new verification code has been sent to ${phone}`,
      [{ text: 'OK' }]
    );
    setOtp(['', '', '', '', '', '']);
    setError('');
    inputRefs.current[0]?.focus();
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

            {/* Title */}
            <View style={styles.titleSection}>
              <AuthBrandHeader
                title="Enter verification code"
                subtitle={`Please enter the 6-digit code sent via SMS to ${phone}`}
              />
            </View>

            {/* SMS Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="chatbubble-ellipses" size={40} color="#0A3D62" />
              </View>
              <Text style={styles.iconText}>Check your SMS messages</Text>
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
                      error && styles.otpInputError,
                    ]}
                    value={digit}
                    onChangeText={(value) => handleOtpChange(value, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    keyboardType="number-pad"
                    maxLength={index === 0 ? 6 : 1}
                    selectTextOnFocus
                  />
                ))}
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            {/* Submit Button */}
            <CustomButton
              title="Verify"
              onPress={handleVerify}
              loading={loading}
              variant="primary"
              style={styles.submitButton}
            />

            {/* Resend Link */}
            <TouchableOpacity onPress={handleResend} style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn&apos;t receive code? </Text>
              <Text style={styles.resendLink}>Resend</Text>
            </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    marginBottom: 12,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF5E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f7f7f7',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
  },
  otpInputFilled: {
    borderColor: '#0A3D62',
    backgroundColor: '#fff',
  },
  otpInputError: {
    borderColor: '#e74c3c',
  },
  errorText: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 8,
  },
  submitButton: {
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

