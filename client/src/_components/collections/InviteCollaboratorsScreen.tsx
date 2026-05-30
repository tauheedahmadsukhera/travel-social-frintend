import React from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

interface User {
  _id: string;
  firebaseUid: string;
  displayName: string;
  avatar?: string;
}

interface InviteCollaboratorsScreenProps {
  followerSearch: string;
  setFollowerSearch: (text: string) => void;
  followers: User[];
  searchResults: User[];
  searching: boolean;
  loadingFollowers: boolean;
  tempSelectedCollaborators: User[];
  onToggleCollaborator: (user: User) => void;
  onConfirm: () => void;
  onGoBack: () => void;
  Header: any;
}

export const InviteCollaboratorsScreen: React.FC<InviteCollaboratorsScreenProps> = ({
  followerSearch,
  setFollowerSearch,
  followers,
  searchResults,
  searching,
  loadingFollowers,
  tempSelectedCollaborators,
  onToggleCollaborator,
  onConfirm,
  onGoBack,
  Header,
}) => {
  const data = followerSearch.trim().length > 1 ? searchResults : followers;
  const loading = followerSearch.trim().length > 1 ? searching : loadingFollowers;

  const isSelected = (user: User) => {
    return tempSelectedCollaborators.some(u => (u._id === user._id || u.firebaseUid === user.firebaseUid));
  };

  const renderItem = ({ item: user }: { item: User }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => onToggleCollaborator(user)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: user.avatar || DEFAULT_AVATAR_URL }} style={styles.userAvatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.userName}>{user.displayName}</Text>
      </View>
      <Ionicons
        name={isSelected(user) ? "checkbox" : "square-outline"}
        size={22}
        color={isSelected(user) ? "#FF8D00" : "#ccc"}
      />
    </TouchableOpacity>
  );

  return (
    <>
      <Header
        title="Add People"
        leftLabel="Cancel"
        rightLabel="Done"
        onLeft={onGoBack}
        onRight={onConfirm}
      />
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search followers..."
          value={followerSearch}
          onChangeText={setFollowerSearch}
          autoFocus
        />
        {followerSearch.length > 0 && (
          <TouchableOpacity onPress={() => setFollowerSearch('')}>
            <Ionicons name="close-circle" size={18} color="#ccc" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item._id || item.firebaseUid}
        style={{ flex: 1 }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#FF8D00" style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.emptyText}>No users found</Text>
          )
        }
      />
    </>
  );
};

const styles = StyleSheet.create({
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', margin: 16, paddingHorizontal: 12, borderRadius: 10, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#111' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  userName: { fontSize: 15, fontWeight: '600', color: '#111' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
});
