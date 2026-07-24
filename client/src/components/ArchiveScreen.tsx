import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function ArchiveScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="archive-outline" size={48} color="#FF6B00" style={{ marginBottom: 16 }} />
      <Text style={styles.header}>Archived Chats</Text>
      <Text style={styles.info}>Here you can view your archived chats.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  header: { fontWeight: '700', fontSize: 22, color: '#FF6B00', marginBottom: 8 },
  info: { fontSize: 15, color: '#666', textAlign: 'center', marginHorizontal: 24 },
});