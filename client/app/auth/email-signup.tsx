import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signUpUser } from '../../lib/firebaseHelpers';
import { checkUsernameAvailability, checkEmailAvailability } from '@/src/services/usernameAuthService';
import { AuthBrandHeader } from '@/src/components/auth/AuthBrandHeader';
import { AuthKeyboardScroll } from '@/src/components/auth/AuthKeyboardScroll';
import CustomButton from '@/src/components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function EmailSignUpScreen() {
  const router = useRouter();
  const { prefillEmail } = useLocalSearchParams<{ prefillEmail?: string }>();
  const [email, setEmail] = useState(prefillEmail || '');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  // Check email availability with debounce
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setEmailAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingEmail(true);
      const available = await checkEmailAvailability(email);
      setEmailAvailable(available);
      setCheckingEmail(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [email]);

  // Check username availability with debounce
  useEffect(() => {
    if (!username || username.trim().length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      const available = await checkUsernameAvailability(username);
      setUsernameAvailable(available);
      setCheckingUsername(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const handleNext = async () => {
    setError('');

    // Validation
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    if (emailAvailable === false) {
      setError('An account already exists with this email');
      return;
    }

    if (!username || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (usernameAvailable === false) {
      setError('username already exists');
      return;
    }

    // Go to next step: enter password
    router.push({
      pathname: '/auth/password-signup',
      params: { email, username, name }
    });
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
              <AuthBrandHeader subtitle="Start your journey." />
            </View>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, styles.usernameInput, prefillEmail ? styles.inputLocked : null]}
                  placeholder="Please enter your email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  editable={!prefillEmail}
                />
                {checkingEmail && (
                  <ActivityIndicator size="small" color="#FF8D00" style={styles.inputIcon} />
                )}
                {!checkingEmail && emailAvailable === true && email.includes('@') && (
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" style={styles.inputIcon} />
                )}
                {!checkingEmail && emailAvailable === false && email.includes('@') && (
                  <Ionicons name="close-circle" size={20} color="#f44336" style={styles.inputIcon} />
                )}
              </View>
              {email.length > 0 && email.includes('@') && emailAvailable === false && (
                <Text style={[styles.hint, { color: '#f44336' }]}>An account already exists with this email</Text>
              )}
            </View>



            {/* Username Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, styles.usernameInput]}
                  placeholder="Please enter a username"
                  placeholderTextColor="#999"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                />
                {checkingUsername && (
                  <ActivityIndicator size="small" color="#FF8D00" style={styles.inputIcon} />
                )}
                {!checkingUsername && usernameAvailable === true && username.length >= 3 && (
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" style={styles.inputIcon} />
                )}
                {!checkingUsername && usernameAvailable === false && username.length >= 3 && (
                  <Ionicons name="close-circle" size={20} color="#f44336" style={styles.inputIcon} />
                )}
              </View>
              {username.length >= 3 && usernameAvailable === false && (
                <Text style={[styles.hint, { color: '#f44336' }]}>username already exists</Text>
              )}
              {username.length >= 3 && usernameAvailable === true && (
                <Text style={[styles.hint, { color: '#4CAF50' }]}>Username is available!</Text>
              )}
              {username.length > 0 && username.length < 3 && (
                <Text style={styles.hint}>Username must be at least 3 characters</Text>
              )}
            </View>

            {/* Name Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Please enter your name (optional)"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
                autoCorrect={false}
              />
            </View>

            {/* Error Message */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {/* EULA Text */}
            <Text style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 12 }}>
              By signing up, you agree to our{' '}
              <Text style={{ fontWeight: '600' }} onPress={() => router.push('/legal/terms' as any)}>Terms of Service</Text> and{' '}
              <Text style={{ fontWeight: '600' }} onPress={() => router.push('/legal/privacy' as any)}>Privacy Policy</Text>.
            </Text>

            {/* Next Button */}
            <CustomButton
              title="Next"
              onPress={handleNext}
              variant="primary"
              style={styles.nextButton}
            />

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
    marginBottom: 10,
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
  inputLocked: {
    backgroundColor: '#ececec',
    color: '#555',
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  usernameInput: {
    flex: 1,
    paddingRight: 45,
  },
  inputIcon: {
    position: 'absolute',
    right: 15,
  },
  hint: {
    fontSize: 12,
    color: '#FF8D00',
    marginTop: 4,
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
    color: '#FF8D00',
    fontWeight: '600',
  },
});

