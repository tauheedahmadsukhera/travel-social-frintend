import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';

interface ProfileActionsProps {
  isOwnProfile: boolean;
  isFollowing: boolean;
  followRequestPending: boolean;
  followLoading: boolean;
  isPrivate: boolean;
  approvedFollower: boolean;
  onFollowToggle: () => void;
  onMessage: () => void;
  onEditProfile: () => void;
  onViewCollections: () => void;
}

const ProfileActions: React.FC<ProfileActionsProps> = ({
  isOwnProfile,
  isFollowing,
  followRequestPending,
  followLoading,
  isPrivate,
  approvedFollower,
  onFollowToggle,
  onMessage,
  onEditProfile,
  onViewCollections
}) => {
  if (isOwnProfile) {
    return (
      <View style={styles.pillRow}>
        <TouchableOpacity style={styles.pillBtn} onPress={onEditProfile}>
          <Feather name="edit-2" size={14} color="#000" style={{ marginRight: 6 }} />
          <Text style={styles.pillText}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} onPress={onViewCollections}>
          <Ionicons name="folder-outline" size={16} color="#000" style={{ marginRight: 6 }} />
          <Text style={styles.pillText}>Collections</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.pillRow}>
      <TouchableOpacity
        style={[styles.followBtn, (isFollowing || followRequestPending) && styles.followingBtn]}
        onPress={onFollowToggle}
        disabled={followLoading || followRequestPending}
      >
        <Text style={[styles.followText, (isFollowing || followRequestPending) && styles.followingText]}>
          {followRequestPending ? 'Requested' : (isFollowing ? 'Following' : 'Follow')}
        </Text>
      </TouchableOpacity>
      
      {(!isPrivate || approvedFollower) && (
        <TouchableOpacity style={styles.pillBtn} onPress={onMessage}>
          <Ionicons name="chatbubble-outline" size={16} color="#000" style={{ marginRight: 6 }} />
          <Text style={styles.pillText}>Message</Text>
        </TouchableOpacity>
      )}
      
      {(!isPrivate || approvedFollower) && (
        <TouchableOpacity style={styles.pillBtn} onPress={onViewCollections}>
          <Ionicons name="folder-outline" size={16} color="#000" style={{ marginRight: 6 }} />
          <Text style={styles.pillText}>Collections</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  pillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  followBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007aff',
    paddingVertical: 10,
    borderRadius: 8,
  },
  followingBtn: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  followText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  followingText: {
    color: '#000',
  }
});

export default ProfileActions;
