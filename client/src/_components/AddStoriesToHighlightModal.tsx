import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addStoryToHighlight } from '../../lib/firebaseHelpers/highlights';
import { useAppDialog } from '@/src/_components/AppDialogProvider';

interface Story {
  id?: string;
  _id?: string;
  storyId?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  views?: string[];
  likes?: string[];
}

interface AddStoriesToHighlightModalProps {
  visible: boolean;
  onClose: () => void;
  highlightId: string;
  stories: Story[];
  onStoryAdded?: () => void;
}

export default function AddStoriesToHighlightModal({
  visible,
  onClose,
  highlightId,
  stories,
  onStoryAdded,
}: AddStoriesToHighlightModalProps) {
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const { showSuccess } = useAppDialog();

  const resolveStoryId = (s: Story) => String(s?.id || s?._id || s?.storyId || '');
  const resolveStoryPreview = (s: Story) => String(s?.imageUrl || s?.thumbnailUrl || s?.mediaUrl || s?.videoUrl || '');

  const toggleStory = (storyId: string) => {
    const newSelected = new Set(selectedStories);
    if (newSelected.has(storyId)) {
      newSelected.delete(storyId);
    } else {
      newSelected.add(storyId);
    }
    setSelectedStories(newSelected);
  };

  const handleAddStories = async () => {
    if (selectedStories.size === 0) {
      Alert.alert('Error', 'Please select at least one story');
      return;
    }

    setLoading(true);
    try {
      let successCount = 0;
      let failureCount = 0;

      for (const storyId of selectedStories) {
        const result = await addStoryToHighlight(highlightId, storyId);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      if (failureCount === 0) {
        showSuccess(`Added ${successCount} ${successCount === 1 ? 'story' : 'stories'} to highlight`);
        setSelectedStories(new Set());
        onClose();
        if (onStoryAdded) {
          onStoryAdded();
        }
      } else {
        Alert.alert(
          'Partial Success',
          `Added ${successCount} story(ies), failed to add ${failureCount}`
        );
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to add stories: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStoryItem = ({ item }: { item: Story }) => {
    const sid = resolveStoryId(item);
    const isSelected = selectedStories.has(sid);

    return (
      <TouchableOpacity
        style={[styles.storyItem, isSelected && styles.storyItemSelected]}
        onPress={() => sid && toggleStory(sid)}
        disabled={loading}
      >
        <Image
          source={{ uri: resolveStoryPreview(item) }}
          style={styles.storyImage}
        />
        {isSelected && (
          <View style={styles.checkmark}>
            <Ionicons name="checkmark-circle" size={32} color="#4CAF50" />
          </View>
        )}
        <View style={styles.storyInfo}>
          <Text style={styles.storyUserName} numberOfLines={1}>
            {item.userName}
          </Text>
          <Text style={styles.storyDate} numberOfLines={1}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="images-outline" size={48} color="#ccc" />
      <Text style={styles.emptyText}>No stories available</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={loading}>
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Add Stories to Highlight</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Stories List */}
        <FlatList
          data={stories}
          renderItem={renderStoryItem}
          keyExtractor={(item, index) => {
            const sid = resolveStoryId(item);
            return sid ? `story_${sid}` : `story_idx_${index}`;
          }}
          ListEmptyComponent={renderEmptyState}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          scrollEnabled={!loading}
        />

        {/* Selection Info */}
        {selectedStories.size > 0 && (
          <View style={styles.selectionInfo}>
            <Text style={styles.selectionText}>
              {selectedStories.size} story(ies) selected
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onClose}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.addButton,
              (selectedStories.size === 0 || loading) && styles.buttonDisabled,
            ]}
            onPress={handleAddStories}
            disabled={selectedStories.size === 0 || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>
                Add {selectedStories.size > 0 ? `(${selectedStories.size})` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  listContent: {
    padding: 8,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  storyItem: {
    flex: 1,
    margin: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  storyItemSelected: {
    borderColor: '#4CAF50',
    borderWidth: 3,
  },
  storyImage: {
    width: '100%',
    aspectRatio: 1,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  storyInfo: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f9f9f9',
  },
  storyUserName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  storyDate: {
    fontSize: 11,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },
  selectionInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f0f8ff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  selectionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066cc',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#4CAF50',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
