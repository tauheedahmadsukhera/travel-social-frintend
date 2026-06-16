import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { uploadImage } from '../../lib/firebaseHelpers/index';
import { getKeyboardOffset } from '../../utils/responsive';
import { highlightManager } from '../../lib/highlightManager';

interface CreateHighlightModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  stories: any[]; // User's active stories list
  onSuccess?: () => void;
}

export default function CreateHighlightModal({
  visible,
  onClose,
  userId,
  stories = [],
  onSuccess,
}: CreateHighlightModalProps) {
  const insets = useSafeAreaInsets();
  const { showSuccess } = useAppDialog();
  const [name, setName] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [visibility, setVisibility] = useState('Public');
  const [loading, setLoading] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());

  // Reset states on visible change
  useEffect(() => {
    if (visible) {
      setName('');
      setCoverImage(null);
      setSelectedStories(new Set());
    }
  }, [visible]);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setCoverImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const toggleStory = (story: any) => {
    const id = story.id || story._id;
    if (!id) return;
    const next = new Set(selectedStories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Auto-set cover image to the first selected story
      if (!coverImage) {
        const cover = story.imageUrl || story.videoUrl || story.thumbnailUrl || null;
        setCoverImage(cover);
      }
    }
    setSelectedStories(next);
  };

  const handleVisibilitySelect = () => {
    Alert.alert(
      'Highlight Visibility',
      'Choose who can see this highlight',
      [
        { text: 'Public', onPress: () => setVisibility('Public') },
        { text: 'Private', onPress: () => setVisibility('Private') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a highlight name');
      return;
    }

    if (selectedStories.size === 0) {
      Alert.alert('Error', 'Please select at least one story');
      return;
    }

    setLoading(true);

    try {
      let finalCoverUrl = coverImage || '';
      
      // If coverImage is a local URI, upload it
      if (finalCoverUrl.startsWith('file://')) {
        const imagePath = `highlights/${userId}/${Date.now()}.jpg`;
        const uploadResult = await uploadImage(finalCoverUrl, imagePath);
        if (!uploadResult.success) throw new Error(uploadResult.error);
        finalCoverUrl = uploadResult.url || '';
      }

      // Filter and get selected story objects
      const selectedStoryObjs = stories.filter(s => selectedStories.has(s.id || s._id));

      // Create highlight using highlightManager
      const result = await highlightManager.createHighlightWithStories({
        userId,
        title: name.trim(),
        stories: selectedStoryObjs,
        visibility,
        coverImage: finalCoverUrl
      });

      if (result.success) {
        showSuccess('Highlight created successfully!');
        onSuccess?.();
        onClose();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create highlight');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={getKeyboardOffset()}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
          
          <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />
            
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} disabled={loading}>
                <Text style={styles.headerActionText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>New highlight</Text>
              <TouchableOpacity onPress={handleCreate} disabled={loading || !name.trim() || selectedStories.size === 0}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FF8D00" />
                ) : (
                  <Text style={[
                    styles.headerActionText, 
                    styles.headerSaveText,
                    (name.trim() && selectedStories.size > 0) && styles.headerSaveActiveText
                  ]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Central Cover Preview */}
            <TouchableOpacity style={styles.coverContainer} onPress={handlePickImage}>
              {coverImage ? (
                <Image source={{ uri: coverImage }} style={styles.coverImage} />
              ) : (
                <View style={styles.placeholderCover}>
                  <Ionicons name="image-outline" size={48} color="#ccc" />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.content}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Highlight name"
                  placeholderTextColor="#999"
                  value={name}
                  onChangeText={setName}
                  maxLength={30}
                />
              </View>

              <TouchableOpacity style={styles.settingBtn} onPress={handleVisibilitySelect}>
                <View style={styles.settingLeft}>
                  <Ionicons name="eye-outline" size={22} color="#000" />
                  <Text style={styles.settingText}>Visibility</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: '#FF8D00', fontSize: 15, marginRight: 8, fontWeight: '500' }}>{visibility}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Stories List for Selection */}
            {stories && stories.length > 0 ? (
              <View style={{ marginTop: 15 }}>
                <Text style={styles.sectionTitle}>Select Stories ({selectedStories.size})</Text>
                <FlatList
                  data={stories}
                  horizontal
                  keyExtractor={(item, idx) => item.id || item._id || String(idx)}
                  renderItem={({ item }) => {
                    const sid = item.id || item._id;
                    const isSelected = selectedStories.has(sid);
                    const mediaUri = item.imageUrl || item.videoUrl || item.thumbnailUrl;
                    return (
                      <TouchableOpacity
                        style={[styles.storyOption, isSelected && styles.storyOptionSelected]}
                        onPress={() => toggleStory(item)}
                      >
                        <Image source={{ uri: mediaUri }} style={styles.storyOptionImage} />
                        {isSelected && (
                          <View style={styles.checkBadge}>
                            <Ionicons name="checkmark-circle" size={18} color="#FF8D00" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 15 }}
                  showsHorizontalScrollIndicator={false}
                />
              </View>
            ) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: '#888', fontSize: 14 }}>No active stories to select</Text>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    minHeight: 480,
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
    paddingVertical: 15,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  headerActionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  headerSaveText: {
    color: '#8e8e8e',
    fontWeight: '600',
  },
  headerSaveActiveText: {
    color: '#FF8D00',
  },
  coverContainer: {
    width: 140,
    height: 140,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 20,
    backgroundColor: '#f5f5f5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCover: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  input: {
    height: 50,
    fontSize: 15,
    color: '#000',
  },
  settingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    color: '#000',
    marginLeft: 15,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  storyOption: {
    width: 68,
    height: 68,
    borderRadius: 8,
    marginRight: 10,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  storyOptionSelected: {
    borderColor: '#FF8D00',
  },
  storyOptionImage: {
    width: '100%',
    height: '100%',
  },
  checkBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#fff',
    borderRadius: 9,
  },
});
