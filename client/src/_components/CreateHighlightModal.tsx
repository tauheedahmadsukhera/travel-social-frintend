import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { createHighlight, uploadImage } from '../../lib/firebaseHelpers/index';
import { getKeyboardOffset } from '../../utils/responsive';

interface CreateHighlightModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: () => void;
  defaultCoverUri?: string;
  initialName?: string;
  storyToInclude?: string;
}

export default function CreateHighlightModal({
  visible,
  onClose,
  userId,
  onSuccess,
  defaultCoverUri,
  initialName = '',
  storyToInclude,
}: CreateHighlightModalProps) {
  const insets = useSafeAreaInsets();
  const { showSuccess } = useAppDialog();
  const [name, setName] = useState(initialName);
  const [coverImage, setCoverImage] = useState<string | null>(defaultCoverUri || null);
  const [visibility, setVisibility] = useState('Public');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultCoverUri) setCoverImage(defaultCoverUri);
  }, [defaultCoverUri]);

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

  const handleVisibilitySelect = () => {
    Alert.alert(
      'Highlight Visibility',
      'Choose who can see this highlight',
      [
        { text: 'Public', onPress: () => setVisibility('Public') },
        { text: 'Private', onPress: () => setVisibility('Private') },
        { text: 'Friends', onPress: () => setVisibility('Friends') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a highlight name');
      return;
    }

    if (!coverImage) {
      Alert.alert('Error', 'Please select a cover image');
      return;
    }

    setLoading(true);

    try {
      let finalCoverUrl = coverImage;
      
      // If coverImage is a local URI, upload it
      if (coverImage.startsWith('file://')) {
        const imagePath = `highlights/${userId}/${Date.now()}.jpg`;
        const uploadResult = await uploadImage(coverImage, imagePath);
        if (!uploadResult.success) throw new Error(uploadResult.error);
        finalCoverUrl = uploadResult.url || '';
      }

      // Create highlight with visibility
      const initialStoryIds = storyToInclude ? [storyToInclude] : [];
      const result = await createHighlight(userId, name, finalCoverUrl, initialStoryIds, visibility);

      if (result.success) {
        showSuccess('Highlight created successfully!');
        setName('');
        setCoverImage(null);
        setVisibility('Public');
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
            
            {/* Custom Header from Screenshot */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} disabled={loading}>
                <Text style={styles.headerActionText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>New highlight</Text>
              <TouchableOpacity onPress={handleCreate} disabled={loading || !name.trim()}>
                {loading ? (
                  <ActivityIndicator size="small" color="#0A3D62" />
                ) : (
                  <Text style={[styles.headerActionText, styles.headerSaveText]}>Save</Text>
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

            {/* Inputs & Settings */}
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
                  <Text style={{ color: '#007aff', fontSize: 15, marginRight: 8, fontWeight: '500' }}>{visibility}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </View>
              </TouchableOpacity>


            </View>
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
    minHeight: 380,
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
    color: '#8e8e8e', // Dimmed when inactive, update logic to make it blue if needed
    fontWeight: '600',
  },
  coverContainer: {
    width: 160,
    height: 160,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 40,
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
    marginBottom: 20,
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
    paddingVertical: 18,
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
});


