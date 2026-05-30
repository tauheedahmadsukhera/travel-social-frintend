import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert, ScrollView } from 'react-native';
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
  onEditProfile?: () => void;
  // Follow / Message actions (for other users)
  isFollowing?: boolean;
  followRequestPending?: boolean;
  followLoading?: boolean;
  onFollowToggle?: () => void;
  onMessage?: () => void;
  followersCount?: number;
  followingCount?: number;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  profile,
  userStories,
  isOwnProfile,
  isPrivate,
  approvedFollower,
  onPressAvatar,
  onAddStory,
  onPressPassport,
  onEditProfile,
  isFollowing,
  followRequestPending,
  followLoading,
  onFollowToggle,
  onMessage,
  followersCount = 0,
  followingCount = 0,
  onPressFollowers,
  onPressFollowing
}) => {
  const avatar = profile?.avatar || profile?.photoURL || profile?.profilePicture;
  const dimmed = isPrivate && !isOwnProfile && !approvedFollower;

  // Dynamic avatar sizes (larger on own profile, compact on others)
  const avatarSize = isOwnProfile ? 104 : 90;
  const storyRingSize = avatarSize + 12;
  const storyRingInnerSize = avatarSize + 6;
  const avatarBorderRadius = avatarSize / 2;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {/* Avatar Section */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatarContainer}>
            {userStories.length > 0 && (
              <LinearGradient
                colors={['#F58529', '#DD2A7B', '#8134AF']}
                style={[styles.storyRing, { width: storyRingSize, height: storyRingSize, borderRadius: storyRingSize / 2 }]}
              >
                <View style={[styles.storyRingInner, { width: storyRingInnerSize, height: storyRingInnerSize, borderRadius: storyRingInnerSize / 2 }]} />
              </LinearGradient>
            )}
            <View style={{ position: 'relative' }}>
              <TouchableOpacity activeOpacity={0.8} onPress={onPressAvatar}>
                <ExpoImage
                  source={{ uri: avatar || 'https://via.placeholder.com/200x200.png?text=Profile' }}
                  style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarBorderRadius }, dimmed && { opacity: 0.3 }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                {dimmed && (
                  <View style={[styles.lockOverlay, { borderRadius: avatarBorderRadius }]}>
                    <Ionicons name="lock-closed" size={40} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>

              {isOwnProfile && onEditProfile && (
                <TouchableOpacity 
                  style={styles.editBadge}
                  activeOpacity={0.9}
                  onPress={() => {
                    hapticLight();
                    onEditProfile();
                  }}
                >
                  <LinearGradient
                    colors={['#FBBC04', '#FF8D00']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Feather name="edit-2" size={12} color="#fff" style={{ zIndex: 1 }} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Info Section (now on the right!) */}
        <View style={styles.infoBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{profile?.name || profile?.displayName || profile?.username || 'User'}</Text>
            {!!profile?.username && <Text style={styles.username}>@{profile.username}</Text>}
          </View>

          {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          
          <View style={styles.statsAndActionsWrapper}>
            <View style={styles.statsAndActionsRow}>
              {(!isPrivate || isOwnProfile || approvedFollower) && (
                <>
                  <TouchableOpacity onPress={onPressFollowers} style={styles.followCountItem}>
                    <Text style={styles.followCountNum} numberOfLines={1} adjustsFontSizeToFit>{followersCount}</Text>
                    <Text style={styles.followCountLbl} numberOfLines={1} adjustsFontSizeToFit>Followers</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={onPressFollowing} style={styles.followCountItem}>
                    <Text style={styles.followCountNum} numberOfLines={1} adjustsFontSizeToFit>{followingCount}</Text>
                    <Text style={styles.followCountLbl} numberOfLines={1} adjustsFontSizeToFit>Following</Text>
                  </TouchableOpacity>
                </>
              )}

              {!isOwnProfile && onFollowToggle && (
                <TouchableOpacity
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                  onPress={onFollowToggle}
                  disabled={followLoading || followRequestPending}
                >
                  {(isFollowing || followRequestPending) ? (
                    <View style={[
                      styles.followBtnInlineLeft, 
                      styles.followingBtnInlineLeft, 
                      { flex: 1, height: '100%', width: '100%', borderRadius: 12 }
                    ]}>
                      <Text style={styles.followingTextStyleInlineLeft} numberOfLines={1}>
                        {followRequestPending ? 'Requested' : 'Following'}
                      </Text>
                    </View>
                  ) : (
                    <LinearGradient
                      colors={['#FBBC04', '#FF8D00']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.followBtnInlineLeft, 
                        { flex: 1, height: '100%', width: '100%', backgroundColor: 'transparent', borderRadius: 12 }
                      ]}
                    >
                      <Feather name="plus" size={13} color="#fff" style={{ marginRight: 3 }} />
                      <Text style={styles.followTextInlineLeft} numberOfLines={1}>
                        Follow
                      </Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  topRow: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  avatarWrapper: {
    alignItems: 'center',
    marginBottom: 12,
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
  editBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 10,
    overflow: 'hidden',
  },
  infoBlock: {
    alignItems: 'center',
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  statsAndActionsWrapper: {
    marginTop: 10,
    width: '100%',
  },
  statsAndActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  followCountItem: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: '#f5f5f5',
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  followCountNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  followCountLbl: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
  },
  username: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
    textAlign: 'center',
  },
  followBtnInlineLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007aff',
    height: 48,
    borderRadius: 12,
  },
  followingBtnInlineLeft: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  followTextInlineLeft: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  followingTextStyleInlineLeft: {
    color: '#000',
  },
  iconBtnInlineLeft: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bio: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  websiteContainer: {
    marginTop: 6,
    alignItems: 'center',
  },
  websiteText: {
    fontSize: 14,
    color: '#007aff',
    textAlign: 'center',
  },
  location: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    textAlign: 'center',
  }
});

export default ProfileHeader;
