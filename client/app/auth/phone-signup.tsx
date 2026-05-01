import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import { AuthKeyboardScroll } from '@/src/_components/auth/AuthKeyboardScroll';
import CustomButton from '@/src/_components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

// Popular countries list
const COUNTRIES = [
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+7', name: 'Russia', flag: '🇷🇺' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+52', name: 'Mexico', flag: '🇲🇽' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+64', name: 'New Zealand', flag: '🇳🇿' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+90', name: 'Turkey', flag: '🇹🇷' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+20', name: 'Egypt', flag: '🇪🇬' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: '+31', name: 'Netherlands', flag: '🇳🇱' },
  { code: '+46', name: 'Sweden', flag: '🇸🇪' },
  { code: '+47', name: 'Norway', flag: '🇳🇴' },
  { code: '+48', name: 'Poland', flag: '🇵🇱' },
  { code: '+41', name: 'Switzerland', flag: '🇨🇭' },
  { code: '+32', name: 'Belgium', flag: '🇧🇪' },
  { code: '+43', name: 'Austria', flag: '🇦🇹' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: '+30', name: 'Greece', flag: '🇬🇷' },
  { code: '+353', name: 'Ireland', flag: '🇮🇪' },
  { code: '+98', name: 'Iran', flag: '🇮🇷' },
  { code: '+964', name: 'Iraq', flag: '🇮🇶' },
  { code: '+972', name: 'Israel', flag: '🇮🇱' },
  { code: '+65', name: 'Singapore', flag: 'ðŸ‡¸ðŸ‡¬' },
  { code: '+852', name: 'Hong Kong', flag: 'ðŸ‡­ðŸ‡°' },
  { code: '+886', name: 'Taiwan', flag: 'ðŸ‡¹ðŸ‡¼' },
];

export default function PhoneSignUpScreen() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[3]); // Default to Pakistan
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNext = async () => {
    setError('');

    // Validation
    if (!phoneNumber || phoneNumber.length < 8) {
      setError('Please enter a valid phone number');
      return;
    }

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const fullPhone = `${selectedCountry.code}${phoneNumber}`;

      // Create account directly with email and phone
      const { signUpUser, updateUserProfile } = await import('../../lib/firebaseHelpers');

      // Generate secure password from phone number + random number
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const tempPassword = `${phoneNumber.replace(/\D/g, '')}${randomNum}!`;
      const username = email.split('@')[0];

      console.log('ðŸ“± Creating account for:', email, 'with phone:', fullPhone);

      // Import auth first
      const { auth } = await import('../../config/firebase');

      // Create account (email verification will be sent automatically)
      const result = await signUpUser(email, tempPassword, username);

      if (result.success) {
        // Store phone number in user profile
        const user = auth?.currentUser;

        if (user) {
          await updateUserProfile(user.uid, {
            phoneNumber: fullPhone
          });

          // Logout user immediately so they must verify email first
          if (auth) {
            await auth.signOut();
          }
        }

        try {
          await Clipboard.setStringAsync(tempPassword);
        } catch {
          /* best-effort: no modal */
        }
        router.replace('/auth/login-options');
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch (err: any) {
      console.error('Phone signup error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AuthKeyboardScroll contentContainerStyle={styles.scrollContent}>
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

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>By phone number</Text>

          {/* Phone Input with Country Picker */}
          <View style={styles.phoneInputWrapper}>
            <TouchableOpacity
              style={styles.countrySelector}
              onPress={() => setShowCountryPicker(true)}
            >
              <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
              <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
              <Ionicons name="chevron-down" size={16} color="#666" />
            </TouchableOpacity>
            <TextInput
              style={styles.phoneInput}
              placeholder="Enter phone number"
              placeholderTextColor="#999"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>

          {/* Email Input */}
          <Text style={[styles.label, { marginTop: 16 }]}>Email address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Country Picker Modal */}
          <Modal
            visible={showCountryPicker}
            animationType="slide"
            transparent={true}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Country</Text>
                  <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                    <Ionicons name="close" size={24} color="#000" />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={COUNTRIES}
                  keyExtractor={(item) => item.code + item.name}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.countryItem}
                      onPress={() => {
                        setSelectedCountry(item);
                        setShowCountryPicker(false);
                      }}
                    >
                      <Text style={styles.countryItemFlag}>{item.flag}</Text>
                      <Text style={styles.countryItemName}>{item.name}</Text>
                      <Text style={styles.countryItemCode}>{item.code}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </Modal>

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
            loading={loading}
            variant="primary"
            style={styles.nextButton}
          />
        </View>

        {/* Social Options */}
        <View style={styles.socialSection}>
          <CustomButton
            title="Continue with Google"
            onPress={() => { }}
            variant="outline"
            style={styles.socialButton}
          />
          <CustomButton
            title="Continue with Apple"
            onPress={() => { }}
            variant="outline"
            style={styles.socialButton}
          />
          <CustomButton
            title="Continue with TikTok"
            onPress={() => { }}
            variant="secondary"
            style={styles.socialButton}
          />
          <CustomButton
            title="Continue with Snap"
            onPress={() => { }}
            variant="outline"
            style={styles.snapButton}
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
    padding: 20,
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
  form: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    height: 50,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  countryCode: {
    fontSize: 15,
    color: '#000',
  },
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    height: 50,
    marginBottom: 8,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    height: '100%',
  },
  countryCodeText: {
    fontSize: 15,
    color: '#000',
    marginRight: 4,
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#000',
  },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    height: 50,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#000',
    marginBottom: 8,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginBottom: 8,
  },
  nextButton: {
    marginTop: 8,
  },
  socialSection: {
    marginBottom: 10,
  },
  socialButton: {
    marginBottom: 8,
  },
  snapButton: {
    backgroundColor: '#FFFC00',
    borderColor: '#FFFC00',
    marginBottom: 12,
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
    color: '#0A3D62',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#0A3D62',
    fontWeight: '600',
  },
  countryList: {
    padding: 8,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
  },
  countryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  countryFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  countryItemFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  countryName: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  countryItemName: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  countryDialCode: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  countryItemCode: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  selectedCountryCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0A3D62',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});

