import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { safeRouterBack } from '@/lib/safeRouterBack';

type StorySettings = {
  allowReplies: boolean;
  allowMentions: boolean;
  allowDownloads: boolean;
  showViewers: boolean;
  autoDeleteAfter24h: boolean;
  allowSearching: boolean;
  privacyLevel: 'everyone' | 'followers' | 'close-friends' | 'custom';
  hideFromList: string[]; // UIDs to hide story from
  allowOnlyFromFollowing: boolean;
  muteNotificationsFrom: string[]; // UIDs to mute notifications from
};

const DEFAULT_SETTINGS: StorySettings = {
  allowReplies: true,
  allowMentions: true,
  allowDownloads: false,
  showViewers: true,
  autoDeleteAfter24h: true,
  allowSearching: true,
  privacyLevel: 'everyone',
  hideFromList: [],
  allowOnlyFromFollowing: false,
  muteNotificationsFrom: [],
};

export default function StorySettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<StorySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('storySettings');
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Failed to load story settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: StorySettings) => {
    try {
      await AsyncStorage.setItem('storySettings', JSON.stringify(newSettings));
      setSettings(newSettings);
      console.log('Story settings saved locally');
    } catch (error) {
      console.error('Failed to save story settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const toggleSetting = (key: keyof StorySettings) => {
    if (typeof settings[key] === 'boolean') {
      const updated = { ...settings, [key]: !settings[key] };
      saveSettings(updated);
    }
  };

  const setPrivacyLevel = (level: 'everyone' | 'followers' | 'close-friends' | 'custom') => {
    const updated = { ...settings, privacyLevel: level };
    saveSettings(updated);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <Text style={{ padding: 20 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <ScrollView>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <TouchableOpacity onPress={() => safeRouterBack()}>
            <Feather name="chevron-left" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={{ fontWeight: '600', fontSize: 18, color: '#000', flex: 1, textAlign: 'center', marginRight: 24 }}>Story Settings</Text>
        </View>

        {/* Privacy Section */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <Text style={{ fontWeight: '600', fontSize: 16, color: '#000', marginBottom: 14 }}>Privacy</Text>

          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setPrivacyLevel('everyone')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 12,
                backgroundColor: settings.privacyLevel === 'everyone' ? '#fff8f0' : '#f9f9f9',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: settings.privacyLevel === 'everyone' ? '#FFB800' : '#eee'
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: '#000' }}>Everyone</Text>
                <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>All users can view your stories</Text>
              </View>
              {settings.privacyLevel === 'everyone' && <Feather name="check-circle" size={20} color="#FFB800" />}
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setPrivacyLevel('followers')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 12,
                backgroundColor: settings.privacyLevel === 'followers' ? '#fff8f0' : '#f9f9f9',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: settings.privacyLevel === 'followers' ? '#FFB800' : '#eee'
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: '#000' }}>Followers Only</Text>
                <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Only your followers can view</Text>
              </View>
              {settings.privacyLevel === 'followers' && <Feather name="check-circle" size={20} color="#FFB800" />}
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setPrivacyLevel('close-friends')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 12,
                backgroundColor: settings.privacyLevel === 'close-friends' ? '#fff8f0' : '#f9f9f9',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: settings.privacyLevel === 'close-friends' ? '#FFB800' : '#eee'
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: '#000' }}>Close Friends</Text>
                <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Only users marked as close friends</Text>
              </View>
              {settings.privacyLevel === 'close-friends' && <Feather name="check-circle" size={20} color="#FFB800" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Interactions Section */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <Text style={{ fontWeight: '600', fontSize: 16, color: '#000', marginBottom: 14 }}>Interactions</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#000' }}>Allow Replies</Text>
              <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Users can reply to your stories</Text>
            </View>
            <Switch
              value={settings.allowReplies}
              onValueChange={() => toggleSetting('allowReplies')}
              trackColor={{ false: '#ccc', true: '#FFB800' }}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#000' }}>Allow Mentions</Text>
              <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Allow others to tag you in their stories</Text>
            </View>
            <Switch
              value={settings.allowMentions}
              onValueChange={() => toggleSetting('allowMentions')}
              trackColor={{ false: '#ccc', true: '#FFB800' }}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#000' }}>Show Viewers</Text>
              <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Show who viewed your story</Text>
            </View>
            <Switch
              value={settings.showViewers}
              onValueChange={() => toggleSetting('showViewers')}
              trackColor={{ false: '#ccc', true: '#FFB800' }}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f9f9f9', borderRadius: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#000' }}>Allow Downloads</Text>
              <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Allow others to download your story</Text>
            </View>
            <Switch
              value={settings.allowDownloads}
              onValueChange={() => toggleSetting('allowDownloads')}
              trackColor={{ false: '#ccc', true: '#FFB800' }}
            />
          </View>
        </View>

        {/* Content Section */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <Text style={{ fontWeight: '600', fontSize: 16, color: '#000', marginBottom: 14 }}>Content</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#000' }}>Auto-Delete After 24h</Text>
              <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Stories disappear after 24 hours</Text>
            </View>
            <Switch
              value={settings.autoDeleteAfter24h}
              onValueChange={() => toggleSetting('autoDeleteAfter24h')}
              trackColor={{ false: '#ccc', true: '#FFB800' }}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f9f9f9', borderRadius: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#000' }}>Allow in Search</Text>
              <Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Appear in hashtag and global stories</Text>
            </View>
            <Switch
              value={settings.allowSearching}
              onValueChange={() => toggleSetting('allowSearching')}
              trackColor={{ false: '#ccc', true: '#FFB800' }}
            />
          </View>
        </View>

        {/* Info */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 16, marginBottom: 20 }}>
          <View style={{ backgroundColor: '#fff8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 4, borderLeftColor: '#FFB800' }}>
            <Text style={{ fontSize: 13, color: '#0A3D62' }}>Tip: Stories shared with Everyone may reach more people and appear in public search results.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
