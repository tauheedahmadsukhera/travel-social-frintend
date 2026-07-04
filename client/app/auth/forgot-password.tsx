import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import { AuthKeyboardScroll } from '@/src/_components/auth/AuthKeyboardScroll';
import CustomButton from '@/src/_components/auth/CustomButton';
import { API_BASE_URL } from '../../lib/api';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSendResetEmail = async () => {
    if (cooldown > 0) return;

    // Validate email
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // Dynamically import Firebase Auth to keep modular imports safe
      const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
      const { auth: authConfig } = await import('../../config/firebase');
      
      const authInstance = authConfig || getAuth();
      if (!authInstance) {
        throw new Error('Authentication service is currently unavailable.');
      }

      await sendPasswordResetEmail(authInstance, trimmedEmail.toLowerCase());
      
      setEmailSent(true);
      setCooldown(60); // 60 seconds spam cooldown
      setShowSuccessModal(true); // Open the custom UI popup modal
    } catch (error: any) {
      console.error('Firebase password reset error:', error);
      let errorMsg = 'Failed to send password reset email. Please try again.';
      
      if (error && error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMsg = 'The email address is not formatted correctly.';
            break;
          case 'auth/user-not-found':
            errorMsg = 'No account was found matching this email address.';
            break;
          case 'auth/too-many-requests':
            errorMsg = 'We have detected too many requests. Please wait a moment before trying again.';
            break;
          case 'auth/network-request-failed':
            errorMsg = 'A network error occurred. Please check your internet connection and try again.';
            break;
          default:
            errorMsg = error.message || errorMsg;
            break;
        }
      } else if (error && error.message) {
        errorMsg = error.message;
      }
      
      Alert.alert('Password Reset Failed', errorMsg);
    } finally {
      setLoading(false);
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

            {/* Title Section */}
            <View style={styles.titleSection}>
              <AuthBrandHeader
                title="Forgot password?"
                subtitle="Enter your email address and we'll send you a secure link to reset your password."
              />
            </View>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email address</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#999" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Please enter your email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  editable={!loading && cooldown === 0}
                />
              </View>
              {emailSent && (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={20} color="#27ae60" style={styles.successIcon} />
                  <Text style={styles.successText}>
                    Reset link sent! Please check your email inbox.
                  </Text>
                </View>
              )}
            </View>

            {/* Send Reset Email Button */}
            <CustomButton
              title={
                loading 
                  ? 'Sending...' 
                  : cooldown > 0 
                    ? `Resend in ${cooldown}s` 
                    : emailSent 
                      ? 'Resend Email' 
                      : 'Send Reset Link'
              }
              onPress={handleSendResetEmail}
              variant="primary"
              style={styles.nextButton}
              disabled={loading || cooldown > 0}
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
      </AuthKeyboardScroll>

      {/* CUSTOM SUCCESS MODAL - PREMIUM UI */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="mail-open-outline" size={48} color="#FF8D00" />
            </View>
            <Text style={styles.modalTitle}>Check Your Inbox</Text>
            <Text style={styles.modalDescription}>
              We have sent a secure password reset link to:{"\n"}
              <Text style={styles.modalEmail}>{email.trim().toLowerCase()}</Text>
            </Text>
            
            <View style={styles.modalInfoBox}>
              <Ionicons name="information-circle-outline" size={20} color="#FF8D00" />
              <Text style={styles.modalInfoText}>
                If you do not see the email, please check your <Text style={{fontWeight: '700'}}>Spam</Text> or <Text style={{fontWeight: '700'}}>Junk</Text> folder.
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => {
                setShowSuccessModal(false);
                router.replace('/auth/login-options');
              }}
            >
              <Text style={styles.modalButtonText}>Back to Login</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  successIcon: {
    marginRight: 4,
  },
  successText: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
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
    color: '#FF8D00',
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF0DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalEmail: {
    fontWeight: '700',
    color: '#FF8D00',
  },
  modalInfoBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFEED5',
  },
  modalInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#A05E00',
    lineHeight: 16,
  },
  modalButton: {
    backgroundColor: '#FF8D00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCloseButton: {
    paddingVertical: 8,
  },
  modalCloseButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
});
