import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';

interface ProfileStatsProps {
  locationsCount: number;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  onPressLocations: () => void;
  onPressFollowers: () => void;
  onPressFollowing: () => void;
  isPrivate?: boolean;
  isOwnProfile?: boolean;
  approvedFollower?: boolean;
}

const ProfileStats: React.FC<ProfileStatsProps> = ({
  locationsCount,
  postsCount,
  followersCount,
  followingCount,
  onPressLocations,
  onPressFollowers,
  onPressFollowing,
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
      <TouchableOpacity style={styles.statItem} onPress={() => { hapticLight(); onPressLocations(); }}>
        <Text style={styles.statNum}>{locationsCount}</Text>
        <Text style={styles.statLbl}>Locations</Text>
      </TouchableOpacity>
      
      <View style={styles.statItem}>
        <Text style={styles.statNum}>{postsCount}</Text>
        <Text style={styles.statLbl}>Posts</Text>
      </View>
      
      <TouchableOpacity style={styles.statItem} onPress={() => { hapticLight(); onPressFollowers(); }}>
        <Text style={styles.statNum}>{followersCount}</Text>
        <Text style={styles.statLbl}>Followers</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.statItem} onPress={() => { hapticLight(); onPressFollowing(); }}>
        <Text style={styles.statNum}>{followingCount}</Text>
        <Text style={styles.statLbl}>Following</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  statLbl: {
    fontSize: 12,
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
