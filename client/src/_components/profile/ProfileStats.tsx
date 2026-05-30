import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';

interface ProfileStatsProps {
  locationsCount: number;
  postsCount: number;
  taggedCount: number;
  collectionsCount: number;
  onPressLocations: () => void;
  onPressPosts?: () => void;
  onPressTags?: () => void;
  onPressCollections?: () => void;
  isPrivate?: boolean;
  isOwnProfile?: boolean;
  approvedFollower?: boolean;
}

const ProfileStats: React.FC<ProfileStatsProps> = ({
  locationsCount,
  postsCount,
  taggedCount,
  collectionsCount,
  onPressLocations,
  onPressPosts,
  onPressTags,
  onPressCollections,
  isPrivate,
  isOwnProfile,
  approvedFollower
}) => {
  const canViewStats = !isPrivate || isOwnProfile || approvedFollower;

  if (!canViewStats) {
    return (
      <View style={styles.privateContainer}>
        <Ionicons name="lock-closed" size={32} color="#999" />
        <Text style={styles.privateText}>This account is private</Text>
        <Text style={styles.subText}>Follow to see their stats and posts</Text>
      </View>
    );
  }

  return (
    <View style={styles.statsRow}>
      <TouchableOpacity style={styles.statItem} onPress={() => { hapticLight(); onPressPosts?.(); }}>
        <Text style={styles.statNum}>{postsCount}</Text>
        <Text style={styles.statLbl} numberOfLines={1}>Posts</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.statItem} onPress={() => { hapticLight(); onPressLocations(); }}>
        <Text style={styles.statNum}>{locationsCount}</Text>
        <Text style={styles.statLbl} numberOfLines={1}>Locations</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.statItem} onPress={() => { hapticLight(); onPressTags?.(); }}>
        <Text style={styles.statNum}>{taggedCount}</Text>
        <Text style={styles.statLbl} numberOfLines={1}>Tags</Text>
      </TouchableOpacity>

      {onPressCollections && (
        <TouchableOpacity style={styles.statItem} onPress={() => { hapticLight(); onPressCollections(); }}>
          <Text style={styles.statNum}>{collectionsCount}</Text>
          <Text style={styles.statLbl} numberOfLines={1}>Saved</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 5,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    gap: 6,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  statNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  statLbl: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  privateContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
  },
  privateText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  subText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
  }
});

export default ProfileStats;
