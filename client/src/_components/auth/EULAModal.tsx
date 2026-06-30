import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface EULAModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export const EULAModal: React.FC<EULAModalProps> = ({
  visible,
  onAccept,
  onDecline,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={32} color="#FF8D00" />
            </View>
            <Text style={styles.title}>Trips – Terms of Use</Text>
            <Text style={styles.date}>Effective: April 30, 2026</Text>
          </View>

          {/* Scrollable Content */}
          <ScrollView 
            style={styles.scroll} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
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
              <Text style={[styles.sectionText, { marginTop: 10 }]}>We review reports and take action where appropriate.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>6. Safety Filtering</Text>
              <Text style={styles.sectionText}>
                Trips uses moderation tools, automated systems, user reporting, and manual review processes to help detect and reduce objectionable content and abusive behavior.
                {'\n\n'}However, we cannot guarantee that all harmful content will be identified or removed immediately.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>7. Account Termination</Text>
              <Text style={styles.sectionText}>
                We may suspend or terminate access to the Services at any time for violations of these Terms, harmful conduct, fraudulent activity, or behavior that creates legal or safety risks.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
              <Text style={styles.sectionText}>
                All platform content, branding, software, and materials provided by Trips are owned by Trips or its licensors and may not be copied, modified, distributed, or exploited without permission.
                {'\n\n'}Users retain ownership of content they create but grant Trips a worldwide, non-exclusive license to host, display, reproduce, and distribute such content solely for operating and improving the Services.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>9. Disclaimer</Text>
              <Text style={styles.sectionText}>
                Trips is provided on an “as is” and “as available” basis without warranties of any kind.
                We do not guarantee uninterrupted availability, security, or error-free operation of the Services.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
              <Text style={styles.sectionText}>
                To the maximum extent permitted by law, Trips shall not be liable for indirect, incidental, consequential, or punitive damages arising from use of the platform, user content, or interactions between users.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>11. Changes to These Terms</Text>
              <Text style={styles.sectionText}>
                We may update these Terms from time to time. Continued use of the Services after changes become effective constitutes acceptance of the updated Terms.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>12. Contact</Text>
              <Text style={styles.sectionText}>
                For questions regarding these Terms, contact:{'\n\n'}metrium.trips@gmail.com
              </Text>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
              <Text style={styles.acceptButtonText}>Accept & Continue</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0F7FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  date: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontWeight: '500',
  },
  scroll: {
    flexGrow: 0,
    marginBottom: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  scrollContent: {
    paddingVertical: 15,
  },
  introText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF8D00',
    marginBottom: 6,
  },
  sectionText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: 'row',
    marginTop: 5,
    paddingRight: 10,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#FF8D00',
    marginRight: 8,
    fontWeight: 'bold',
  },
  bulletText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    flex: 1,
  },
  actions: {
    gap: 10,
  },
  acceptButton: {
    backgroundColor: '#FF8D00',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  declineButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});
