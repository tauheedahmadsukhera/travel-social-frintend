import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticLight } from '@/lib/haptics';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { permanentlyDeleteAccount } from '@/lib/gdprCompliance';
import { resolveCanonicalUserId } from '@/lib/currentUser';
import { auth } from '@/config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            safeRouterBack();
          }}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity
          style={styles.feedbackBtn}
          onPress={() => {
            hapticLight();
            Alert.alert(
              'Send Feedback',
              'Email your feedback or report an issue to support@travesocial.com',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Email', onPress: () => {
                    // Open mail client
                    import('react-native').then(({ Linking }) => {
                      Linking.openURL('mailto:support@travesocial.com?subject=App Feedback');
                    });
                  }
                }
              ]
            );
          }}
        >
          <Feather name="message-circle" size={18} color="#0A3D62" />
          <Text style={styles.feedbackText}>Send Feedback / Report Issue</Text>
        </TouchableOpacity>

        {/* Blocked Users Section */}
        <TouchableOpacity
          style={[styles.settingsItem, { backgroundColor: '#fff5f5', borderColor: '#ffcfcf' }]}
          onPress={() => {
            hapticLight();
            router.push('/blocked-users' as any);
          }}
        >
          <Feather name="slash" size={20} color="#e74c3c" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsTitle}>Blocked Users</Text>
            <Text style={styles.settingsSubtitle}>Manage users you have blocked</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#ccc" />
        </TouchableOpacity>

        {/* App Version & About Section */}
        <View style={styles.aboutBox}>
          <Text style={styles.aboutTitle}>About Trips</Text>
          <Text style={styles.aboutText}>Version 1.0.0</Text>
          <Text style={styles.aboutText}>© 2025 tauhee56. All rights reserved.</Text>
          <Text style={styles.aboutText}>For help or feedback, email support@travesocial.com</Text>
        </View>

        {/* Legal Section */}
        <View style={styles.legalBox}>
          <Text style={styles.legalTitle}>Legal</Text>
          <TouchableOpacity
            style={styles.legalItem}
            onPress={() => {
              hapticLight();
              router.push('/legal/privacy' as any);
            }}
          >
            <Feather name="shield" size={18} color="#667eea" style={{ marginRight: 10 }} />
            <Text style={styles.legalText}>Privacy Policy</Text>
            <Feather name="chevron-right" size={18} color="#ccc" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.legalItem}
            onPress={() => {
              hapticLight();
              router.push('/legal/terms' as any);
            }}
          >
            <Feather name="file-text" size={18} color="#667eea" style={{ marginRight: 10 }} />
            <Text style={styles.legalText}>Terms of Service</Text>
            <Feather name="chevron-right" size={18} color="#ccc" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.legalBox, { marginTop: 20, borderColor: '#ffcfcf' }]}>
          <Text style={[styles.legalTitle, { color: '#e74c3c' }]}>Danger Zone</Text>
          <TouchableOpacity
            style={styles.legalItem}
            onPress={() => {
              hapticLight();
              Alert.alert(
                'Delete Account',
                'Are you sure you want to delete your account? This action is permanent and cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        const userId = await resolveCanonicalUserId();
                        if (userId) {
                          await permanentlyDeleteAccount(userId);
                        }
                        // Logout locally regardless of API success to ensure they are logged out
                        await auth.signOut();
                        await AsyncStorage.clear();
                        router.replace('/auth/welcome' as any);
                      } catch (err) {
                        console.error('Failed to delete account:', err);
                        Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
                      }
                    }
                  }
                ]
              );
            }}
          >
            <Feather name="trash-2" size={18} color="#e74c3c" style={{ marginRight: 10 }} />
            <Text style={[styles.legalText, { color: '#e74c3c' }]}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  feedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbe6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    margin: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#ffe0a3',
    shadowColor: '#0A3D62',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  feedbackText: {
    marginLeft: 10,
    color: '#0A3D62',
    fontWeight: '600',
    fontSize: 15,
  },
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
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  aboutBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbf5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#ffe0a3',
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  settingsSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  aboutTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
    marginBottom: 6,
  },
  aboutText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  legalBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    margin: 16,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#eee',
  },
  legalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  legalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
  },
  legalText: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
  },
});
