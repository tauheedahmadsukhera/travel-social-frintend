import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.lastUpdated}>Last Updated: December 21, 2025</Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing or using Trips, you agree to be bound by these Terms of Service. 
          If you do not agree, do not use the App.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.paragraph}>
          Trips is a social media platform that allows users to:{'\n'}
          • Create and share posts with photos and locations{'\n'}
          • Follow other users and view their content{'\n'}
          • Send direct messages{'\n'}
          • Create and view stories{'\n'}
          • Go live and watch live streams{'\n'}
          • Discover content on an interactive map
        </Text>

        <Text style={styles.sectionTitle}>3. Eligibility</Text>
        <Text style={styles.paragraph}>
          • You must be at least 13 years old{'\n'}
          • You must provide accurate information{'\n'}
          • You must not have been previously banned{'\n'}
          • You must comply with all applicable laws
        </Text>

        <Text style={styles.sectionTitle}>4. User Accounts</Text>
        <Text style={styles.paragraph}>
          • You are responsible for account security{'\n'}
          • Do not share your password{'\n'}
          • Notify us of unauthorized access{'\n'}
          • We may suspend accounts for violations{'\n'}
          • You may delete your account anytime
        </Text>

        <Text style={styles.sectionTitle}>5. User Content</Text>
        <Text style={styles.subTitle}>5.1 Your Content</Text>
        <Text style={styles.paragraph}>
          • You retain ownership of your content{'\n'}
          • You grant us a license to use and display it{'\n'}
          • You are responsible for its legality{'\n'}
          • Do not post illegal or harmful content
        </Text>

        <Text style={styles.subTitle}>5.2 Prohibited Content</Text>
        <Text style={styles.paragraph}>
          You must not post content that:{'\n'}
          • Violates laws or regulations{'\n'}
          • Infringes intellectual property{'\n'}
          • Contains hate speech or harassment{'\n'}
          • Promotes violence or illegal activities{'\n'}
          • Contains nudity or sexual content{'\n'}
          • Is spam or misleading{'\n'}
          • Violates others&apos; privacy
        </Text>

        <Text style={styles.sectionTitle}>6. User Conduct</Text>
        <Text style={styles.paragraph}>
          You agree not to:{'\n'}
          • Impersonate others or create fake accounts{'\n'}
          • Harass, bully, or threaten users{'\n'}
          • Collect user data without permission{'\n'}
          • Use bots or automated tools{'\n'}
          • Hack or disrupt the App{'\n'}
          • Violate intellectual property rights{'\n'}
          • Engage in illegal activities
        </Text>

        <Text style={styles.sectionTitle}>7. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          • The App and its features are owned by us{'\n'}
          • Our trademarks are protected{'\n'}
          • You retain rights to your original content{'\n'}
          • You grant us a license to use your content
        </Text>

        <Text style={styles.sectionTitle}>8. Third-Party Services</Text>
        <Text style={styles.paragraph}>
          We use:{'\n'}
          • Google, Apple, TikTok, Snapchat for sign-in{'\n'}
          • Firebase (Google) for hosting{'\n'}
          • Agora for live streaming{'\n'}
          • Google Maps for location services{'\n\n'}
          We are not responsible for third-party services.
        </Text>

        <Text style={styles.sectionTitle}>9. Disclaimers</Text>
        <Text style={styles.paragraph}>
          • The App is provided &quot;as is&quot; without warranties{'\n'}
          • We do not guarantee uninterrupted service{'\n'}
          • We are not responsible for user content{'\n'}
          • Do not rely on content for professional advice
        </Text>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          • We are not liable for indirect damages{'\n'}
          • Our liability is limited to $100{'\n'}
          • We are not liable for third-party services
        </Text>

        <Text style={styles.sectionTitle}>11. Contact Us</Text>
        <Text style={styles.paragraph}>
          Email: support@trave-social.app{'\n'}
          Address: [Your Company Address]
        </Text>

        <Text style={styles.paragraph}>
          By using Trips, you agree to these Terms of Service.
        </Text>

        <TouchableOpacity 
          style={styles.linkButton}
          onPress={() => router.push('/legal/privacy' as any)}
        >
          <Text style={styles.linkText}>View Privacy Policy →</Text>
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

