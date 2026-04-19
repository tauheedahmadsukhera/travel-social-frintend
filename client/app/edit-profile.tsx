import { DEFAULT_AVATAR_URL } from '../lib/api';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadImage } from '../lib/firebaseHelpers';
import { updateUserProfile } from '../lib/firebaseHelpers/index';
import { getUserProfile } from '@/src/_services/firebaseService';
import { useAuthLoading } from '@/src/_components/UserContext';
import { hapticLight, hapticMedium, hapticSuccess } from '../lib/haptics';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { safeRouterBack } from '@/lib/safeRouterBack';

// Runtime import with fallback
let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.warn('expo-image-picker not available');
}

export default function EditProfile() {
    // Default avatar from Firebase Storage
    
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showSuccess } = useAppDialog();
  const [userId, setUserId] = useState<string | null>(null);
  const authLoading = useAuthLoading();
  
  // Get current user ID from AsyncStorage (token-based auth)
  useEffect(() => {
    const getUserId = async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        setUserId(uid);
        console.log('📋 EditProfile loaded with userId:', uid);
      } catch (error) {
        console.error('[EditProfile] Failed to get userId from storage:', error);
      }
    };
    getUserId();
  }, []);
  
  console.log('📋 EditProfile current userId:', userId);
  
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [interests, setInterests] = useState('');
  const [avatar, setAvatar] = useState('');
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  // Load profile whenever userId changes
  useEffect(() => {
    let isMounted = true;

    const initializeProfile = async () => {
      try {
        // If userId is set, load their profile
        if (userId) {
          console.log('👤 Loading profile for userId:', userId);
          setLoading(true);
          await loadProfileWithId(userId);
        } else {
          // Still waiting for userId from AsyncStorage
          console.log('â³ Waiting for userId from AsyncStorage...');
          setLoading(true);
        }
      } catch (err) {
        console.error('âŒ Error in initializeProfile:', err);
        if (isMounted) setLoading(false);
      }
    };

    initializeProfile();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  async function loadProfileWithId(uid: string) {
    console.log('🔄 Loading profile for uid:', uid);
    try {
      const result = await getUserProfile(uid);
      
      if (result?.success && result?.data) {
        console.log('✅ Profile loaded:', {
          displayName: result.data.displayName,
          email: result.data.email,
        });
        
        // Map fields correctly - response has displayName, not name
        setName(result.data.displayName || result.data.name || '');
        setUsername((result.data as any).username || (result.data as any).displayName || '');
        setBio(result.data.bio || '');
        setWebsite(result.data.website || '');
        setLocation((result.data as any).location || '');
        setPhone((result.data as any).phone || '');
        setInterests((result.data as any).interests || '');
        setAvatar(result.data.avatar || '');
        setIsPrivate(!!(result.data as any).isPrivate);
        setError(null);
      } else {
        console.warn('âš ï¸ Profile fetch returned no data - using empty form');
        setError(null);
      }
    } catch (err) {
      console.warn('âš ï¸ Error loading profile - still showing form:', err);
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  // Legacy helper kept for compatibility; prefer loadProfileWithId
  async function loadProfile() {
    if (!userId) {
      console.warn('âš ï¸ No userId - showing empty form');
      setLoading(false);
      return;
    }
    await loadProfileWithId(userId);
  }

  function validate() {
    if (!name || name.trim().length < 2) return 'Please enter your name';
    return null;
  }

  async function handleSave() {
    const v = validate();
    setError(v);
    if (v) return;

    if (!userId) {
      console.error('âŒ User not authenticated - cannot save profile');
      console.log('   userId:', userId);
      Alert.alert('Error', 'You must be logged in to save your profile');
      return;
    }

    hapticMedium();
    console.log('💾 Saving profile with userId:', userId);
    
    console.log('💾 Saving profile changes...');
    console.log('  UserId:', userId);
    console.log('  Name:', name);
    console.log('  Username:', username);
    console.log('  Bio:', bio);
    console.log('  Website:', website);
    console.log('  Location:', location);
    console.log('  Phone:', phone);
    console.log('  Interests:', interests);
    console.log('  IsPrivate:', isPrivate);
    console.log('  New Avatar URI:', newAvatarUri ? 'Yes' : 'No');
    
    setSaving(true);
    setError(null);
    
    try {
      let finalAvatar = avatar;
      
      // Upload new avatar if picked
      if (newAvatarUri) {
        console.log('📤 Uploading new avatar...');
        const uploadResult = await uploadImage(newAvatarUri, `avatars/${userId}`);
        if (uploadResult && uploadResult.success && uploadResult.url) {
          finalAvatar = uploadResult.url;
          console.log('✅ Avatar uploaded:', finalAvatar.substring(0, 50));
        } else {
          throw new Error(uploadResult.error || 'Failed to upload image');
        }
      }
      
      // Update profile with avatar URL
      console.log('💾 Updating Firestore profile...');
      const result = await updateUserProfile(userId, {
        name,
        username,
        displayName: name, // Also set displayName for Firebase
        bio,
        website,
        location,
        phone,
        interests,
        avatar: finalAvatar,
        photoURL: finalAvatar, // Also set photoURL
        isPrivate,
        updatedAt: new Date().toISOString(),
      });
      
      if (result && result.success) {
        hapticSuccess();
        console.log('✅ Profile updated');
        
        // If privacy setting changed, TODO: implement backend API to update all user's posts
        console.log('🔄 Updating posts privacy to:', isPrivate);
        
        try {
          // TODO: Call backend API to update user posts
          // const response = await fetch(`/api/users/${user.uid}/posts/privacy`, {
          //   method: 'PATCH',
          //   headers: { 'Content-Type': 'application/json' },
          //   body: JSON.stringify({ isPrivate })
          // });
          
          console.log(`ðŸ“ Posts privacy update complete`);
        } catch (error) {
          console.error('âŒ Error updating posts privacy:', error);
          Alert.alert('Warning', `Profile updated but some posts may not have been updated. Please try again.`);
        }
        
        // Reload profile to get fresh data
        await loadProfile();
        
        showSuccess('Profile updated!', { onOk: () => safeRouterBack() });
      } else {
        throw new Error(result.error || 'Failed to update profile');
      }
    } catch (e: any) {
      console.error('Save profile error:', e);
      setError(e.message || 'Failed to save profile');
      Alert.alert('Error', e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function pickImage() {
    if (!ImagePicker) {
      Alert.alert('Not available', 'Image picker not installed. Run: npx expo install expo-image-picker');
      return;
    }
    hapticLight();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow access to your photos.');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setNewAvatarUri(uri);
        setAvatar(uri); // Preview locally
      }
    } catch (err) {
      console.warn('ImagePicker error', err);
    }
  }

  if (loading || authLoading) {
    // Show loading while either auth context or profile data is still loading
    return (
      <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color="#0A3D62" />
        <Text style={{ marginTop: 16, color: '#666', fontSize: 14 }}>Loading your profile...</Text>
      </SafeAreaView>
    );
  }

  // If auth is done but profile data still loading, show form with overlay indicator
  // This prevents the user from being stuck on a blank loader screen
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              safeRouterBack();
            }}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={20} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Avatar */}
          <TouchableOpacity onPress={pickImage} style={styles.avatarContainer} disabled={loading}>
            <Image source={{ uri: avatar || DEFAULT_AVATAR_URL }} style={styles.avatar} />
          </TouchableOpacity>

          {/* Form Fields */}
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput 
              value={name} 
              onChangeText={setName} 
              style={styles.input} 
              placeholder="Emma Lumna" 
              placeholderTextColor="#999"
              editable={!loading}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput 
              value={username} 
              onChangeText={setUsername} 
              style={styles.input} 
              placeholder="@username" 
              placeholderTextColor="#999"
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput 
              value={bio} 
              onChangeText={setBio} 
              style={styles.input} 
              placeholder="Add bio" 
              placeholderTextColor="#999" 
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Links</Text>
            <TextInput
              value={website}
              onChangeText={setWebsite}
              style={styles.input}
              placeholder="Add links"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              style={styles.input}
              placeholder="City, Country"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              style={styles.input}
              placeholder="+1 (555) 123-4567"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Interests</Text>
            <TextInput
              value={interests}
              onChangeText={setInterests}
              style={[styles.input, { height: 80 }]}
              placeholder="e.g., Photography, Travel, Food"
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Privacy Toggle (temporarily disabled)
          <View style={styles.privacySection}>
            <View style={styles.privacyRow}>
              <View style={styles.privacyLeft}>
                <Ionicons name="lock-closed-outline" size={22} color="#667eea" style={{ marginRight: 10 }} />
                <View>
                  <Text style={styles.privacyLabel}>Private Account</Text>
                  <Text style={styles.privacyInfo}>
                    {isPrivate
                      ? 'Only approved followers can see your posts'
                      : 'Anyone can see your posts'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={setIsPrivate}
                trackColor={{ false: '#ddd', true: '#667eea' }}
                thumbColor="#fff"
              />
            </View>
          </View>
          */}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={async () => {
              hapticLight();
              Alert.alert(
                'Log Out',
                'Are you sure you want to log out?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        console.log('[Logout] Starting logout process...');
                        const { logoutUser } = await import('@/src/_services/firebaseAuthService');
                        const result = await logoutUser();

                        if (result.success) {
                          console.log('✅ [Logout] AsyncStorage cleared successfully');
                          console.log('[Logout] Navigating to welcome screen...');
                          router.replace('/auth/welcome');

                          // Force reload after a moment to ensure clean state
                          setTimeout(() => {
                            console.log('[Logout] Reloading app...');
                            if (typeof window !== 'undefined' && window.location) {
                              window.location.reload();
                            }
                          }, 100);
                        } else {
                          console.error('âŒ [Logout] Failed:', result);
                          Alert.alert('Error', 'Failed to log out');
                        }
                      } catch (err: any) {
                        console.error('âŒ [Logout] Exception:', err);
                        Alert.alert('Error', 'Failed to log out');
                      }
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.shareBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave} 
            disabled={saving}
          >
            <Text style={styles.shareText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      
      {/* Loading overlay when fetching profile data (but auth is done) */}
      {loading && !authLoading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#0A3D62" />
            <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>Loading profile data...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const PRIMARY = '#0A3D62';
const SECONDARY = '#111';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#e0e0e0' 
  },
  closeBtn: { 
    width: 40, 
    height: 40, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ddd',
    padding: 8
  },
  closeIcon: { 
    fontSize: 24, 
    color: '#000', 
    fontWeight: '300' 
  },
  headerTitle: { 
    fontWeight: '600', 
    fontSize: 16, 
    color: '#000', 
    textAlign: 'center',
    flex: 1
  },
  content: { 
    flex: 1,
    paddingTop: 24 
  },
  scrollContent: {
    paddingBottom: 120,
  },
  avatarContainer: { 
    width: '100%',
    alignItems: 'center', 
    marginBottom: 32 
  },
  avatar: { 
    width: 100, 
    height: 100, 
    borderRadius: 50, 
    backgroundColor: '#f0f0f0' 
  },
  formGroup: { 
    paddingHorizontal: 16, 
    paddingVertical: 8,
    borderBottomWidth: 0,
    alignItems: 'flex-start',
  },
  fieldLabel: { 
    fontSize: 13, 
    color: '#444', 
    fontWeight: '500', 
    marginBottom: 8,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  input: { 
    fontSize: 14, 
    color: '#222', 
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  error: {
    color: '#e0245e',
    marginTop: 12,
    paddingHorizontal: 16
  },
  privacySection: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginHorizontal: 16,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privacyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  privacyLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 4,
  },
  privacyInfo: {
    fontSize: 13,
    color: '#666',
    maxWidth: 220,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0'
  },
  logoutBtn: { 
    paddingVertical: 12, 
    paddingHorizontal: 20 
  },
  logoutText: { 
    fontSize: 15, 
    color: '#000', 
    fontWeight: '400' 
  },
  shareBtn: { 
    backgroundColor: PRIMARY, 
    paddingVertical: 10, 
    paddingHorizontal: 32, 
    borderRadius: 8 
  },
  shareText: { 
    color: '#fff', 
    fontWeight: '600', 
    fontSize: 15 
  },
});

