import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@/lib/storage';

export default function EULAScreen() {
  const router = useRouter();

  const handleAccept = async () => {
    await AsyncStorage.setItem('eula_accepted_v2', 'true');
    router.replace('/(tabs)/home');
  };

  const handleDecline = () => {
    // If they decline after logging in, we log them out and go back to welcome
    AsyncStorage.multiRemove(['token', 'userId', 'eula_accepted_v2']);
    router.replace('/auth/welcome');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={40} color="#FF8D00" />
          </View>
          <Text style={styles.title}>Community Guidelines & Terms</Text>
          <Text style={styles.subtitle}>Please review our terms of use to continue to Trips.</Text>
        </View>

        {/* Full Screen Scrollable Content */}
        <ScrollView 
          style={styles.scroll} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.legalHeader}>
            <Text style={styles.legalTitle}>Trips – Terms of Use</Text>
            <Text style={styles.date}>Effective date: April 30, 2026</Text>
          </View>

          <Text style={styles.introText}>
            Welcome to Trips. By creating an account or using the Trips application and related services (“Services”), you agree to these Terms of Use.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Eligibility</Text>
            <Text style={styles.sectionText}>
              You must comply with all applicable laws when using Trips. Users under the age required by local law must have permission from a parent or guardian where applicable.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. User Content</Text>
            <Text style={styles.sectionText}>
              Trips allows users to create, upload, stream, share, and interact with user-generated content, including videos, images, messages, and profile information.
              {'\n\n'}You are solely responsible for the content you post and the interactions you engage in through the platform.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Prohibited Content and Conduct</Text>
            <Text style={styles.sectionText}>Users may not post, stream, upload, share, or promote content that:</Text>
            {[
              'Is illegal, abusive, threatening, defamatory, hateful, discriminatory, or sexually exploitative',
              'Contains harassment, bullying, stalking, or intimidation',
              'Promotes violence, terrorism, or self-harm',
              'Involves nudity or explicit sexual content where prohibited',
              'Violates intellectual property or privacy rights',
              'Contains spam, scams, fraud, or misleading information',
              'Attempts to exploit or harm minors',
              'Circumvents moderation or safety systems',
            ].map((item, index) => (
              <View key={index} style={styles.bulletRow}>
                <Text style={styles.bulletPoint}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
            <Text style={[styles.sectionText, { marginTop: 10 }]}>Users may not harass, impersonate, threaten, or abuse other users.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Moderation and Enforcement</Text>
            <Text style={styles.sectionText}>
              Trips reserves the right to monitor, review, remove, restrict, or disable any content or account at our discretion where necessary to maintain platform safety, enforce these Terms, or comply with legal obligations.
              {'\n\n'}Violations may result in content removal, temporary suspension, permanent account termination, or reporting to relevant authorities.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Reporting and Blocking</Text>
            <Text style={styles.sectionText}>Trips provides mechanisms for users to:</Text>
            {[
              'Report objectionable or abusive content',
              'Report users who violate these Terms',
              'Block users to prevent further interaction'
            ].map((item, index) => (
              <View key={index} style={styles.bulletRow}>
                <Text style={styles.bulletPoint}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Safety Filtering</Text>
            <Text style={styles.sectionText}>
              Trips uses moderation tools, automated systems, user reporting, and manual review processes to help detect and reduce objectionable content and abusive behavior.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Account Termination</Text>
            <Text style={styles.sectionText}>
              We may suspend or terminate access to the Services at any time for violations of these Terms, harmful conduct, or safety risks.
            </Text>
          </View>

          <View style={[styles.section, { borderBottomWidth: 0 }]}>
            <Text style={styles.sectionTitle}>Zero Tolerance Policy</Text>
            <View style={styles.safetyBox}>
              <Text style={styles.safetyText}>
                Trips has a zero-tolerance policy for objectionable content or abusive users. By continuing, you agree to uphold these community standards.
              </Text>
            </View>
          </View>
          
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Text style={styles.acceptButtonText}>I Agree & Continue</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.declineButton} onPress={handleDecline}>
            <Text style={styles.declineButtonText}>Decline & Logout</Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 24,
  },
  header: {
    paddingVertical: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F7FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20,
  },
  legalHeader: {
    marginBottom: 20,
  },
  legalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF8D00',
  },
  date: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  introText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    fontWeight: '600',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  sectionText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#FF8D00',
    marginRight: 10,
    fontWeight: 'bold',
  },
  bulletText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    flex: 1,
  },
  safetyBox: {
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFEBEB',
  },
  safetyText: {
    fontSize: 13,
    color: '#E0245E',
    fontWeight: '600',
    lineHeight: 18,
  },
  footer: {
    paddingVertical: 20,
    gap: 12,
  },
  acceptButton: {
    backgroundColor: '#FF8D00',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF8D00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  declineButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineButtonText: {
    color: '#ff4d4d',
    fontSize: 14,
    fontWeight: '600',
  },
});
