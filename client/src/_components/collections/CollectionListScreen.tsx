import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

interface Collection {
  _id: string;
  name: string;
  coverImage?: string;
  postIds: string[];
}

interface CollectionListScreenProps {
  collections: Collection[];
  loading: boolean;
  postId: string;
  postImageUrl?: string;
  isGloballySaved: boolean;
  onGlobalToggle: () => void;
  onToggleCollection: (id: string) => void;
  onGoToNew: () => void;
  onClose: () => void;
  insets: any;
  Header: any;
}

export const CollectionListScreen: React.FC<CollectionListScreenProps> = ({
  collections,
  loading,
  postId,
  postImageUrl,
  isGloballySaved,
  onGlobalToggle,
  onToggleCollection,
  onGoToNew,
  onClose,
  insets,
  Header,
}) => {
  const isSavedInCol = (col: Collection) => col.postIds?.includes(postId);

  return (
    <>
      <Header
        title="Collection"
        leftLabel="Cancel"
        rightLabel="New collection"
        onLeft={onClose}
        onRight={onGoToNew}
      />

      <View style={styles.savedToAllRow}>
        <View style={styles.savedToAllThumb}>
          {postImageUrl ? (
            <ExpoImage source={{ uri: postImageUrl }} style={styles.collThumbImg} contentFit="cover" />
          ) : (
            <View style={[styles.collThumbImg, styles.collThumbPlaceholder]}>
              <Feather name="bookmark" size={20} color="#666" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.savedToAllTitle}>Saved</Text>
          <Text style={styles.savedToAllSub}>Private</Text>
        </View>
        <TouchableOpacity onPress={onGlobalToggle} style={{ padding: 4 }}>
          <Ionicons
            name={isGloballySaved ? "bookmark" : "bookmark-outline"}
            size={24}
            color={isGloballySaved ? "#FF8D00" : "#999"}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.collectionsDivider} />
      <Text style={styles.collectionsLabel}>Collections</Text>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FF8D00" />
          </View>
        ) : collections.length === 0 ? (
          <View style={[styles.emptyState, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.emptyIconWrap}>
              <Feather name="bookmark" size={36} color="#FF8D00" />
            </View>
            <Text style={styles.emptyTitle}>Organize the post you love</Text>
            <Text style={styles.emptySubtitle}>
              Save posts and pictures just for you or to share with others.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={onGoToNew} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Create your first collection</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            <View style={styles.collectionsList}>
              {collections.map(col => (
                <TouchableOpacity
                  key={col._id}
                  style={styles.collRow}
                  onPress={() => onToggleCollection(col._id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.collThumb}>
                    {col.coverImage ? (
                      <ExpoImage source={{ uri: col.coverImage }} style={styles.collThumbImg} contentFit="cover" />
                    ) : (
                      <View style={[styles.collThumbImg, styles.collThumbPlaceholder]}>
                        <Feather name="folder" size={24} color="#ccc" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.collName}>{col.name}</Text>
                  {isSavedInCol(col) ? (
                    <Ionicons name="checkmark-circle" size={24} color="#FF8D00" />
                  ) : (
                    <Ionicons name="add-circle-outline" size={24} color="#ccc" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  savedToAllRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  savedToAllThumb: { width: 44, height: 44, borderRadius: 6, overflow: 'hidden', marginRight: 12, backgroundColor: '#f0f0f0' },
  collThumbImg: { width: '100%', height: '100%' },
  collThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' },
  savedToAllTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  savedToAllSub: { fontSize: 13, color: '#666', marginTop: 1 },
  collectionsDivider: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 16, marginVertical: 4 },
  collectionsLabel: { fontSize: 14, fontWeight: '800', color: '#111', marginHorizontal: 16, marginTop: 12, marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0f4f8', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#111', textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: { backgroundColor: '#FF8D00', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  collectionsList: { paddingHorizontal: 16, paddingBottom: 20 },
  collRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  collThumb: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', marginRight: 14, backgroundColor: '#f0f0f0' },
  collName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111' },
});
