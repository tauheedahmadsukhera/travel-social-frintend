import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import { API_BASE_URL } from '../../lib/api';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSendResetEmail = async () => {
    // Validate email
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (data.success) {
        setEmailSent(true);
        Alert.alert(
          'Code Sent',
          'A 6-digit verification code has been sent to your email. Please check your inbox.',
          [
            {
              text: 'OK',
              onPress: () => router.push({
                pathname: '/auth/reset-password',
                params: { email: email.trim().toLowerCase() }
              })
            }
          ]
        );
      } else {
        throw new Error(data.error || 'Failed to send reset code');
      }
    } catch (error: any) {
      console.error('Password reset error:', error);
      Alert.alert('Error', error.message || 'Failed to send reset code. Please try again.');
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
              <AuthBrandHeader
                title="Forgot password?"
                subtitle={`Enter your email address and we'll send you a link to reset your password.`}
              />
            </View>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email address</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#999" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading && !emailSent}
                />
              </View>
              {emailSent && (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={20} color="#27ae60" />
                  <Text style={styles.successText}>Reset email sent! Check your inbox.</Text>
                </View>
              )}
            </View>

            {/* Send Reset Email Button */}
            <CustomButton
              title={loading ? "Sending..." : emailSent ? "Resend Email" : "Send Reset Link"}
              onPress={handleSendResetEmail}
              variant="primary"
              style={styles.nextButton}
              disabled={loading}
            />

            {/* Back to Login */}
            <TouchableOpacity
              onPress={() => safeRouterBack()}
              style={styles.backToLoginButton}
              disabled={loading}
            >
              <Text style={styles.backToLoginText}>Back to Login</Text>
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
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#000',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d4edda',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  successText: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
  },
  nextButton: {
    marginTop: 5,
  },
  backToLoginButton: {
    marginTop: 10,
    alignItems: 'center',
    padding: 12,
  },
  backToLoginText: {
    fontSize: 15,
    color: '#0A3D62',
    fontWeight: '600',
  },
});

