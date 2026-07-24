import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StatsRowProps {
  locationsCount: number;
  postsCount: number;
  followersCount: number;
  followingCount: number;
}

const StatsRow: React.FC<StatsRowProps> = ({ locationsCount, postsCount, followersCount, followingCount }) => (
  <View style={styles.statsRow}>
    <View style={styles.statItem}>
      <Text style={styles.statNum}>{locationsCount}</Text>
      <Text style={styles.statLbl}>Locations</Text>
    </View>
    <View style={styles.statItem}>
      <Text style={styles.statNum}>{postsCount}</Text>
      <Text style={styles.statLbl}>Posts</Text>
    </View>
    <View style={styles.statItem}>
      <Text style={styles.statNum}>{followersCount}</Text>
      <Text style={styles.statLbl}>Followers</Text>
    </View>
    <View style={styles.statItem}>
      <Text style={styles.statNum}>{followingCount}</Text>
      <Text style={styles.statLbl}>Following</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0' },
  statItem: { alignItems: 'center' },
  statNum: { fontWeight: '700', fontSize: 18, color: '#222' },
  statLbl: { fontSize: 12, color: '#666', marginTop: 2 },
});

export default StatsRow;
