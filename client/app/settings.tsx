import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticLight } from '@/lib/haptics';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { permanentlyDeleteAccount } from '@/lib/gdprCompliance';
import { resolveCanonicalUserId } from '@/lib/currentUser';
import { auth } from '@/config/firebase';
import AsyncStorage from '@/lib/storage';
import { useThemeColors } from '@/lib/theme';
import { apiService } from '@/src/_services/apiService';

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [blockedCount, setBlockedCount] = useState<number | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      const fetchBlockedCount = async () => {
        try {
          const canonicalId = await resolveCanonicalUserId();
          if (canonicalId) {
            const res = await apiService.get(`/users/${canonicalId}/blocked`);
            if (isMounted && res?.success && Array.isArray(res.data)) {
              setBlockedCount(res.data.length);
            }
          }
        } catch (e) {
          console.warn('Failed to fetch blocked count in settings:', e);
        }
      };
      fetchBlockedCount();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            router.replace({ pathname: '/(tabs)/profile', params: { openMenu: 'true' } } as any);
          }}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} style={{ backgroundColor: colors.background }}>
        <TouchableOpacity
          style={[styles.feedbackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => {
            hapticLight();
            Alert.alert(
              'Send Feedback',
              'Email your feedback or report an issue to metrium.trips@gmail.com',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Email', onPress: () => {
                    // Open mail client
                    Linking.openURL('mailto:metrium.trips@gmail.com?subject=App Feedback').catch(() => {
                      Alert.alert(
                        'Error',
                        'Unable to open mail client. Please send email manually to metrium.trips@gmail.com'
                      );
                    });
                  }
                }
              ]
            );
          }}
        >
          <Feather name="message-circle" size={18} color="#FF8D00" />
          <Text style={styles.feedbackText}>Send Feedback / Report Issue</Text>
        </TouchableOpacity>

        {/* Blocked Users Section */}
        <TouchableOpacity
          style={[styles.settingsItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => {
            hapticLight();
            router.push('/blocked-users' as any);
          }}
        >
          <Feather name="slash" size={20} color="#e74c3c" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingsTitle, { color: colors.text }]}>Blocked Users{blockedCount !== null && blockedCount > 0 ? ` (${blockedCount})` : ''}</Text>
            <Text style={[styles.settingsSubtitle, { color: colors.textSecondary }]}>{blockedCount === 0 ? 'No blocked users' : 'Manage users you have blocked'}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* App Version & About Section */}
        <View style={[styles.aboutBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.aboutTitle, { color: colors.text }]}>About Trips</Text>
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>Version 1.0.0</Text>
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>© 2025 tauhee56. All rights reserved.</Text>
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>For help or feedback, email metrium.trips@gmail.com</Text>
        </View>

        {/* Legal Section */}
        <View style={[styles.legalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.legalTitle, { color: colors.text }]}>Legal</Text>
          <TouchableOpacity
            style={[styles.legalItem, { borderTopColor: colors.border }]}
            onPress={() => {
              hapticLight();
              router.push('/legal/privacy' as any);
            }}
          >
            <Feather name="shield" size={18} color="#667eea" style={{ marginRight: 10 }} />
            <Text style={[styles.legalText, { color: colors.text }]}>Privacy Policy</Text>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.legalItem, { borderTopColor: colors.border }]}
            onPress={() => {
              hapticLight();
              router.push('/legal/terms' as any);
            }}
          >
            <Feather name="file-text" size={18} color="#667eea" style={{ marginRight: 10 }} />
            <Text style={[styles.legalText, { color: colors.text }]}>Terms of Service</Text>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.legalBox, { marginTop: 20, borderColor: '#ffcfcf', backgroundColor: colors.surface }]}>
          <Text style={[styles.legalTitle, { color: '#e74c3c' }]}>Danger Zone</Text>
          <TouchableOpacity
            style={[styles.legalItem, { borderTopColor: colors.border }]}
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
                        if (auth) {
                          await auth.signOut();
                        }
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
    shadowColor: '#FF8D00',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  feedbackText: {
    marginLeft: 10,
    color: '#FF8D00',
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
