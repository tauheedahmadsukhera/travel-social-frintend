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
        <TouchableOpacity 
          onPress={() => router.replace({ pathname: '/(tabs)/profile', params: { openMenu: 'true' } } as any)} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.lastUpdated}>Effective date: April 30, 2026</Text>

        <Text style={styles.sectionTitle}>1. Eligibility</Text>
        <Text style={styles.paragraph}>
          You must comply with all applicable laws when using Trips. Users under the age required by local law must have permission from a parent or guardian where applicable.
        </Text>

        <Text style={styles.sectionTitle}>2. User Content</Text>
        <Text style={styles.paragraph}>
          Trips allows users to create, upload, stream, share, and interact with user-generated content, including videos, images, messages, and profile information.
          You are solely responsible for the content you post and the interactions you engage in through the platform.
        </Text>

        <Text style={styles.sectionTitle}>3. Prohibited Content and Conduct</Text>
        <Text style={styles.paragraph}>
          Users may not post, stream, upload, share, or promote content that:{'\n'}
          • Is illegal, abusive, threatening, defamatory, hateful, discriminatory, or sexually exploitative{'\n'}
          • Contains harassment, bullying, stalking, or intimidation{'\n'}
          • Promotes violence, terrorism, or self-harm{'\n'}
          • Involves nudity or explicit sexual content where prohibited{'\n'}
          • Violates intellectual property or privacy rights{'\n'}
          • Contains spam, scams, fraud, or misleading information{'\n'}
          • Attempts to exploit or harm minors{'\n'}
          • Circumvents moderation or safety systems{'\n\n'}
          Users may not harass, impersonate, threaten, or abuse other users.
        </Text>

        <Text style={styles.sectionTitle}>4. Moderation and Enforcement</Text>
        <Text style={styles.paragraph}>
          Trips reserves the right to monitor, review, remove, restrict, or disable any content or account at our discretion where necessary to maintain platform safety, enforce these Terms, or comply with legal obligations.
          Violations may result in content removal, temporary suspension, permanent account termination, or reporting to relevant authorities.
        </Text>

        <Text style={styles.sectionTitle}>5. Reporting and Blocking</Text>
        <Text style={[styles.paragraph, { fontWeight: '600', color: '#e0245e' }]}>
          Trips has a zero-tolerance policy for objectionable content or abusive users.
        </Text>
        <Text style={styles.paragraph}>
          Trips provides mechanisms for users to:{'\n'}
          • Report objectionable or abusive content{'\n'}
          • Report users who violate these Terms{'\n'}
          • Block users to prevent further interaction{'\n\n'}
          We review reports and take action where appropriate.
        </Text>

        <Text style={styles.sectionTitle}>6. Safety Filtering</Text>
        <Text style={styles.paragraph}>
          Trips uses moderation tools, automated systems, user reporting, and manual review processes to help detect and reduce objectionable content and abusive behavior.
          However, we cannot guarantee that all harmful content will be identified or removed immediately.
        </Text>

        <Text style={styles.sectionTitle}>7. Account Termination</Text>
        <Text style={styles.paragraph}>
          We may suspend or terminate access to the Services at any time for violations of these Terms, harmful conduct, fraudulent activity, or behavior that creates legal or safety risks.
        </Text>

        <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          All platform content, branding, software, and materials provided by Trips are owned by Trips or its licensors and may not be copied, modified, distributed, or exploited without permission.
          Users retain ownership of content they create but grant Trips a worldwide, non-exclusive license to host, display, reproduce, and distribute such content solely for operating and improving the Services.
        </Text>

        <Text style={styles.sectionTitle}>9. Disclaimer</Text>
        <Text style={styles.paragraph}>
          Trips is provided on an “as is” and “as available” basis without warranties of any kind.
          We do not guarantee uninterrupted availability, security, or error-free operation of the Services.
        </Text>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          To the maximum extent permitted by law, Trips shall not be liable for indirect, incidental, consequential, or punitive damages arising from use of the platform, user content, or interactions between users.
        </Text>

        <Text style={styles.sectionTitle}>11. Changes to These Terms</Text>
        <Text style={styles.paragraph}>
          We may update these Terms from time to time. Continued use of the Services after changes become effective constitutes acceptance of the updated Terms.
        </Text>

        <Text style={styles.sectionTitle}>12. Contact</Text>
        <Text style={styles.paragraph}>
          For questions regarding these Terms, contact: metrium.trips@gmail.com
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

