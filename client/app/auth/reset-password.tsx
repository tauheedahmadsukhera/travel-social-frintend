import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import { API_BASE_URL } from '../../lib/api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code sent to your email');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code,
          newPassword: password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        Alert.alert(
          'Success',
          'Your password has been reset successfully!',
          [{ text: 'Login Now', onPress: () => router.push('/auth/email-login') }]
        );
      } else {
        throw new Error(data.error || 'Failed to reset password');
      }
    } catch (error: any) {
      console.error('Reset password error:', error);
      Alert.alert('Error', error.message || 'Verification failed. Please check the code.');
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
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>

            <View style={styles.titleSection}>
              <AuthBrandHeader
                title="Reset Password"
                subtitle={`Enter the 6-digit code sent to ${typeof email === 'string' ? email : 'your email'} and choose your new password.`}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Verification Code</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#999" />
                <TextInput
                  style={styles.input}
                  placeholder="6-digit code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={20} color="#999" />
                <TextInput
                  style={styles.input}
                  placeholder="Min 6 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={20} color="#999" />
                <TextInput
                  style={styles.input}
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>
            </View>

            <CustomButton
              title={loading ? "Resetting..." : "Reset Password"}
              onPress={handleResetPassword}
              variant="primary"
              disabled={loading}
              style={{ marginTop: 20 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1 },
  content: { padding: 25 },
  backButton: { marginBottom: 20 },
  titleSection: { marginBottom: 30 },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  input: { flex: 1, padding: 16, fontSize: 16, color: '#000', marginLeft: 10 },
});
