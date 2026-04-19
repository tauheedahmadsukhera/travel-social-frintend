import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.lastUpdated}>Last Updated: December 21, 2025</Text>

        <Text style={styles.sectionTitle}>1. Introduction</Text>
        <Text style={styles.paragraph}>
          Welcome to Trips. We respect your privacy and are committed to protecting your personal data. 
          This privacy policy explains how we collect, use, and safeguard your information.
        </Text>

        <Text style={styles.sectionTitle}>2. Information We Collect</Text>
        <Text style={styles.subTitle}>2.1 Information You Provide</Text>
        <Text style={styles.paragraph}>
          • Account Information: Name, email, phone number, username{'\n'}
          • Profile Information: Bio, profile picture, location, website{'\n'}
          • Content: Posts, photos, comments, messages, stories{'\n'}
          • Location Data: GPS coordinates (with your permission)
        </Text>

        <Text style={styles.subTitle}>2.2 Automatically Collected</Text>
        <Text style={styles.paragraph}>
          • Device Information: Device type, OS, identifiers{'\n'}
          • Usage Data: Features used, time spent, interactions{'\n'}
          • Log Data: IP address, browser type, access times
        </Text>

        <Text style={styles.sectionTitle}>3. How We Use Your Information</Text>
        <Text style={styles.paragraph}>
          • Provide and maintain our services{'\n'}
          • Create and manage your account{'\n'}
          • Enable social features (posts, messages, live streaming){'\n'}
          • Show your location on maps (with permission){'\n'}
          • Send notifications{'\n'}
          • Improve our app{'\n'}
          • Prevent fraud and ensure security
        </Text>

        <Text style={styles.sectionTitle}>4. How We Share Your Information</Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Public Information:</Text> Your profile, posts, and comments are public.{'\n\n'}
          <Text style={styles.bold}>With Other Users:</Text> Direct messages are private.{'\n\n'}
          <Text style={styles.bold}>Service Providers:</Text> Firebase, Agora, Google Maps.{'\n\n'}
          <Text style={styles.bold}>We Do NOT Sell Your Data.</Text>
        </Text>

        <Text style={styles.sectionTitle}>5. Data Storage and Security</Text>
        <Text style={styles.paragraph}>
          • Storage: Firebase (Google Cloud) servers{'\n'}
          • Security: Industry-standard encryption (HTTPS, TLS){'\n'}
          • Retention: As long as your account is active{'\n'}
          • Deletion: You can delete your account anytime
        </Text>

        <Text style={styles.sectionTitle}>6. Your Rights</Text>
        <Text style={styles.paragraph}>
          • Access: Request a copy of your data{'\n'}
          • Correction: Update incorrect information{'\n'}
          • Deletion: Delete your account and data{'\n'}
          • Portability: Export your data{'\n'}
          • Objection: Opt out of certain processing{'\n'}
          • Withdraw Consent: Stop sharing optional data
        </Text>

        <Text style={styles.sectionTitle}>7. Children&apos;s Privacy</Text>
        <Text style={styles.paragraph}>
          Our app is not intended for children under 13. We do not knowingly collect data from children under 13.
        </Text>

        <Text style={styles.sectionTitle}>8. Contact Us</Text>
        <Text style={styles.paragraph}>
          Email: support@trave-social.app{'\n'}
          Address: [Your Company Address]
        </Text>

        <Text style={styles.paragraph}>
          By using Trips, you agree to this Privacy Policy.
        </Text>

        <TouchableOpacity 
          style={styles.linkButton}
          onPress={() => router.push('/legal/terms' as any)}
        >
          <Text style={styles.linkText}>View Terms of Service →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  lastUpdated: {
    fontSize: 12,
    color: '#666',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 20,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    marginBottom: 40,
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
});

