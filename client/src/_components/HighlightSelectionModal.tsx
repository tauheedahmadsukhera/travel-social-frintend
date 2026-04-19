import { Feather, Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Highlight {
  id?: string;
  _id?: string;
  title: string;
  coverImage: string;
}

interface HighlightSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  highlights: Highlight[];
  onSelectHighlight: (highlightId: string) => void;
  onCreateNew: () => void;
  loading?: boolean;
}

export default function HighlightSelectionModal({
  visible,
  onClose,
  highlights,
  onSelectHighlight,
  onCreateNew,
  loading = false,
}: HighlightSelectionModalProps) {
  const insets = useSafeAreaInsets();
  const hasHighlights = highlights && highlights.length > 0;
  const resolveHighlightId = (h: any) => String(h?.id || h?._id || '');

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.iconCircle}>
        <Ionicons name="chevron-down" size={32} color="#000" />
      </View>
      <Text style={styles.emptyTitle}>Organize and save your stories</Text>
      <Text style={styles.emptySubtitle}>
        Save stories just for you or to share it with others
      </Text>
      
      <TouchableOpacity style={styles.createButton} onPress={onCreateNew}>
        <Text style={styles.createButtonText}>Create your first highlight</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHighlightItem = ({ item }: { item: Highlight }) => (
    <TouchableOpacity 
      style={styles.highlightItem} 
      onPress={() => {
        const hid = resolveHighlightId(item);
        if (hid) onSelectHighlight(hid);
      }}
    >
      <Image source={{ uri: item.coverImage }} style={styles.highlightCover} />
      <Text style={styles.highlightTitle} numberOfLines={1}>{item.title}</Text>
      <Ionicons name="add-circle-outline" size={24} color="#666" style={styles.addIcon} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add to a highlight</Text>
            {hasHighlights && (
              <TouchableOpacity onPress={onCreateNew}>
                <Text style={styles.newBtnText}>New highlight</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#0A3D62" style={{ marginVertical: 40 }} />
          ) : hasHighlights ? (
            <FlatList
              data={highlights}
              keyExtractor={(item) => resolveHighlightId(item) || `hl_${Math.random().toString(36).slice(2)}`}
              renderItem={renderHighlightItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            renderEmptyState()
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 300,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  newBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007aff',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f5f5f5',
  },
  highlightCover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  highlightTitle: {
    flex: 1,
    marginLeft: 15,
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  addIcon: {
    marginLeft: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: '#2b5a9e',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
