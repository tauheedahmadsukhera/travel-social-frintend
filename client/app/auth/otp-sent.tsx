import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function OTPSentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const contact = params.contact as string || '';
  const method = params.method as string || 'email';
  const flow = params.flow as string || 'login'; // 'login' | 'signup' | 'reset'

  const getOTPRoute = () => {
    if (flow === 'reset') {
      return '/auth/reset-otp';
    }
    return '/auth/phone-otp';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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

        <View style={styles.titleSection}>
          <AuthBrandHeader
            title="Check your email"
            subtitle={`We've sent a verification code to your email${contact ? ` associated with ${contact}` : ''}.`}
          />
        </View>

        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail" size={50} color="#0A3D62" />
          </View>
        </View>

        {/* Email Info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#666" />
          <Text style={styles.infoText}>
            Please check your inbox and spam folder for the verification code.
          </Text>
        </View>

        {/* Continue Button */}
        <CustomButton
          title="Enter Verification Code"
          onPress={() => router.push({
            pathname: getOTPRoute(),
            params: { contact, method, flow }
          })}
          variant="primary"
          style={styles.continueButton}
        />

        {/* Resend Link */}
        <TouchableOpacity style={styles.resendContainer}>
          <Text style={styles.resendText}>Didn&apos;t receive the code? </Text>
          <Text style={styles.resendLink}>Resend</Text>
        </TouchableOpacity>

        {/* Change Method */}
        <TouchableOpacity 
          style={styles.changeMethod}
          onPress={() => safeRouterBack()}
        >
          <Text style={styles.changeMethodText}>
            Use a different {method === 'phone' ? 'phone number' : 'email'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFF5E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 10,
    lineHeight: 20,
  },
  continueButton: {
    marginBottom: 15,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
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
  changeMethod: {
    alignItems: 'center',
  },
  changeMethodText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
});

