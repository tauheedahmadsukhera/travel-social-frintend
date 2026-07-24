import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

interface FriendsScreenProps {
  friends: any[];
}
export default function FriendsScreen({ friends }: FriendsScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Friends</Text>
      <FlatList
        data={friends}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Ionicons name="person-circle-outline" size={32} color="#FF6B00" style={{ marginRight: 12 }} />
            <Text style={styles.name}>{item.name}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No friends yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  header: { fontWeight: '700', fontSize: 22, color: '#FF6B00', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16, color: '#222', fontWeight: '600' },
  empty: { color: '#999', fontSize: 15, textAlign: 'center', marginTop: 32 },
});