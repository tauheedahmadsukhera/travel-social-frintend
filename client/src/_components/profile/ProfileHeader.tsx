import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticLight } from '@/lib/haptics';
import { getOptimizedImageUrl } from '@/lib/imageHelpers';

interface ProfileHeaderProps {
  profile: any;
  userStories: any[];
  isOwnProfile: boolean;
  isPrivate: boolean;
  approvedFollower: boolean;
  onPressAvatar: () => void;
  onAddStory: () => void;
  onPressPassport: () => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  profile,
  userStories,
  isOwnProfile,
  isPrivate,
  approvedFollower,
  onPressAvatar,
  onAddStory,
  onPressPassport
}) => {
  const avatar = profile?.avatar || profile?.photoURL || profile?.profilePicture;
  const dimmed = isPrivate && !isOwnProfile && !approvedFollower;

  return (
    <View style={styles.container}>
      {/* Avatar Section */}
      <View style={styles.avatarWrapper}>
        <View style={styles.avatarContainer}>
          {userStories.length > 0 && (
            <LinearGradient
              colors={['#F58529', '#DD2A7B', '#8134AF']}
              style={styles.storyRing}
            >
              <View style={styles.storyRingInner} />
            </LinearGradient>
          )}
          <TouchableOpacity activeOpacity={0.8} onPress={onPressAvatar}>
            <ExpoImage
              source={{ uri: avatar || 'https://via.placeholder.com/200x200.png?text=Profile' }}
              style={[styles.avatar, dimmed && { opacity: 0.3 }]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            {dimmed && (
              <View style={styles.lockOverlay}>
                <Ionicons name="lock-closed" size={40} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          {isOwnProfile && (
            <TouchableOpacity style={styles.addStoryBtn} onPress={onAddStory}>
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Info Section */}
      <View style={styles.infoBlock}>
        <Text style={styles.displayName}>{profile?.name || profile?.displayName || profile?.username || 'User'}</Text>
        {!!profile?.username && <Text style={styles.username}>@{profile.username}</Text>}
        
        {!isOwnProfile && (
          <TouchableOpacity style={styles.passportBtn} onPress={onPressPassport}>
            <Feather name="briefcase" size={18} color="#000" style={{ marginRight: 8 }} />
            <Text style={styles.passportText}>Passport</Text>
          </TouchableOpacity>
        )}

        {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        
        {!!profile?.website && (!isPrivate || isOwnProfile || approvedFollower) && (
          <View style={styles.websiteContainer}>
            <TouchableOpacity 
              onPress={() => Linking.openURL(profile.website).catch(() => Alert.alert('Error', 'Cannot open link'))}
            >
              <Text style={styles.websiteText} numberOfLines={1}>{profile.website}</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {!!profile?.location && (!isPrivate || isOwnProfile || approvedFollower) && (
          <Text style={styles.location}>📍 {profile.location}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  avatarWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyRing: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 51,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyRingInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#fff',
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 45,
  },
  addStoryBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007aff',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    zIndex: 2,
  },
  infoBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  username: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  passportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
  },
  passportText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  bio: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  websiteContainer: {
    marginTop: 8,
  },
  websiteText: {
    fontSize: 14,
    color: '#007aff',
  },
  location: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  }
});

export default ProfileHeader;
