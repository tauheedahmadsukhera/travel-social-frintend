import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  StyleSheet,
  Dimensions,
  Keyboard,
  Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { createStory } from '@/lib/firebaseHelpers';
import { feedEventEmitter } from '@/lib/feedEventEmitter';

const AutoplayVideoPreview: React.FC<{ uri: string; style: any }> = ({ uri, style }) => {
  const videoRef = React.useRef<Video>(null);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function resolve() {
      if (uri.startsWith('ph://') || uri.startsWith('assets-library://') || uri.startsWith('content://')) {
        try {
          const assetId = uri.startsWith('ph://')
            ? uri.replace('ph://', '').split('/')[0]
            : uri.startsWith('content://')
            ? uri.split('/').pop() || uri
            : uri;
          const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, { copyToLocalContainer: true } as any);
          if (active && assetInfo?.localUri) {
            setResolvedUri(assetInfo.localUri);
            return;
          }
        } catch (e) {
          console.warn('[AutoplayVideoPreview] Failed to resolve URI:', e);
        }
      }
      if (active) {
        setResolvedUri(uri);
      }
    }
    resolve();
    return () => {
      active = false;
    };
  }, [uri]);

  // Force play when loaded or resolved uri changes
  useEffect(() => {
    if (isLoaded && videoRef.current) {
      videoRef.current.playAsync().catch(() => {});
    }
  }, [isLoaded, resolvedUri]);

  return (
    <View style={style}>
      {!isLoaded && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', borderRadius: 12 }]}>
          {uri.startsWith('ph://') || uri.startsWith('assets-library://') ? (
            <Image
              source={{ uri }}
              style={{ width: '100%', height: '100%', borderRadius: 12 }}
              resizeMode="cover"
            />
          ) : (
            <ActivityIndicator size="small" color="#FF8D00" />
          )}
        </View>
      )}
      {resolvedUri && (
        <Video
          ref={videoRef}
          source={{ uri: resolvedUri }}
          style={[StyleSheet.absoluteFillObject, { opacity: isLoaded ? 1 : 0, borderRadius: 12 }]}
          resizeMode={ResizeMode.COVER}
          useNativeControls={false}
          status={{
            shouldPlay: true,
            isMuted: true,
            isLooping: true,
          }}
          onLoad={() => setIsLoaded(true)}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.positionMillis >= 2000) {
              videoRef.current?.setStatusAsync({ positionMillis: 0, shouldPlay: true }).catch(() => {});
            }
          }}
        />
      )}
    </View>
  );
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_HEIGHT < 700;

const responsiveValues = {
  imageHeight: isSmallDevice ? 240 : 340,
  titleSize: isSmallDevice ? 16 : 18,
  labelSize: isSmallDevice ? 13 : 14,
  inputSize: isSmallDevice ? 14 : 15,
  spacing: isSmallDevice ? 12 : 16,
  spacingLarge: isSmallDevice ? 16 : 20,
  inputHeight: isSmallDevice ? 44 : 48,
  modalPadding: isSmallDevice ? 20 : 20,
};

interface UploadStoryModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMedia: any;
  setSelectedMedia: (media: any) => void;
  currentUserId: string | null;
  locationQuery: string;
  setLocationQuery: (query: string) => void;
  locationSuggestions: any[];
  setLocationSuggestions: (suggestions: any[]) => void;
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
  uploadProgress: number;
  setUploadProgress: (progress: number) => void;
  showSuccess: (message: string) => void;
}

export const UploadStoryModal: React.FC<UploadStoryModalProps> = ({
  visible,
  onClose,
  selectedMedia,
  setSelectedMedia,
  currentUserId,
  locationQuery,
  setLocationQuery,
  locationSuggestions,
  setLocationSuggestions,
  uploading,
  setUploading,
  uploadProgress,
  setUploadProgress,
  showSuccess,
}) => {
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} disabled={uploading}>
              <Feather name="x" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Story</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: responsiveValues.modalPadding }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Media Preview */}
              {selectedMedia ? (
                <View style={styles.mediaPreviewContainer}>
                  {selectedMedia.type === 'video' ? (
                    <AutoplayVideoPreview uri={selectedMedia.uri} style={styles.modalImage} />
                  ) : (
                    <Image
                      source={{ uri: selectedMedia.uri }}
                      style={styles.modalImage}
                      resizeMode="cover"
                    />
                  )}
                  <TouchableOpacity
                    style={styles.changeMediaButton}
                    onPress={async () => {
                      const pickerResult = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images', 'videos'],
                        allowsEditing: true,
                        aspect: [9, 16],
                        quality: 0.7,
                        videoMaxDuration: 720,
                        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
                      });
                      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0]?.uri) {
                        setSelectedMedia(pickerResult.assets[0]);
                      }
                    }}
                  >
                    <Feather name="edit-2" size={16} color="#FF8D00" />
                    <Text style={styles.changeMediaText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Caption Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Caption (Optional)</Text>
                <TextInput
                  placeholder="Write something..."
                  value={selectedMedia?.caption || ''}
                  onChangeText={text => setSelectedMedia((prev: any) => prev ? { ...prev, caption: text } : prev)}
                  style={styles.inputField}
                  placeholderTextColor="#999"
                  multiline
                />
              </View>

              {/* Location Input */}
              <View style={[styles.inputGroup, { zIndex: 10 }]}>
                <Text style={styles.inputLabel}>Location (Optional)</Text>
                <View style={{ position: 'relative' }}>
                  <View style={styles.locationInputContainer}>
                    <Feather name="map-pin" size={18} color="#666" />
                    <TextInput
                      placeholder="Add location..."
                      value={locationQuery}
                      onChangeText={setLocationQuery}
                      style={styles.locationInput}
                      placeholderTextColor="#999"
                    />
                  </View>
                  {locationSuggestions.length > 0 && (
                    <View style={styles.locationDropdown}>
                      <ScrollView keyboardShouldPersistTaps="handled">
                        {locationSuggestions.map((item) => (
                          <TouchableOpacity
                            key={item.placeId}
                            style={styles.locationItem}
                            onPress={() => {
                              Keyboard.dismiss();
                              setSelectedMedia((prev: any) => prev ? {
                                ...prev,
                                locationData: { name: item.name, address: item.address, placeId: item.placeId }
                              } : prev);
                              setLocationQuery(item.name);
                              setLocationSuggestions([]);
                            }}
                          >
                            <Feather name="map-pin" size={16} color="#FF8D00" style={{ marginRight: 8 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.locationName}>{item.name}</Text>
                              <Text style={styles.locationAddress} numberOfLines={1}>{item.address}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>

              {/* Upload Progress */}
              {uploading && (
                <View style={styles.uploadingArea}>
                  <ActivityIndicator size="small" color="#FF8D00" style={{ marginBottom: 8 }} />
                  <Text style={styles.uploadingText}>Uploading {uploadProgress}%</Text>
                  <View style={styles.uploadingBarBg}>
                    <View style={[styles.uploadingBar, { width: `${uploadProgress}%` }]} />
                  </View>
                </View>
              )}

              {/* Share Button */}
              <TouchableOpacity
                style={[styles.shareButton, !selectedMedia && styles.shareButtonDisabled]}
                disabled={!selectedMedia || uploading}
                onPress={async () => {
                  if (!selectedMedia || !currentUserId || uploading) return;
                  setUploading(true);
                  setUploadProgress(0);
                  try {
                    let uploadUri = selectedMedia.uri;
                    const mediaType = selectedMedia.type === 'video' ? 'video' : 'image';
                    if (mediaType === 'image') {
                      const manipResult = await ImageManipulator.manipulateAsync(
                        selectedMedia.uri,
                        [{ resize: { width: 1080 } }],
                        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                      );
                      uploadUri = manipResult.uri;
                    }
                    const storyRes = await createStory(
                      currentUserId,
                      uploadUri,
                      mediaType,
                      undefined,
                      selectedMedia.locationData,
                      undefined,
                      'Everyone',
                      [],
                      (p: number) => setUploadProgress(Math.round(p))
                    );
                    if (storyRes?.success) {
                      setUploadProgress(100);
                      setTimeout(() => {
                        onClose();
                        setSelectedMedia(null);
                        setUploading(false);
                        feedEventEmitter.emit('feedUpdated');
                        showSuccess('Story shared successfully!');
                      }, 500);
                    }
                  } catch (err: any) {
                    setUploading(false);
                    const msg = err?.message || 'Something went wrong while sharing your story.';
                    Alert.alert('Upload Failed', msg);
                  }
                }}
              >
                <Text style={styles.shareButtonText}>{uploading ? 'Sharing...' : 'Share Story'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: responsiveValues.spacing,
    paddingHorizontal: responsiveValues.modalPadding,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: responsiveValues.titleSize,
    fontWeight: '700',
    color: '#222',
  },
  mediaPreviewContainer: {
    marginTop: responsiveValues.spacingLarge,
    marginBottom: responsiveValues.spacingLarge,
  },
  modalImage: {
    width: '100%',
    height: responsiveValues.imageHeight,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  changeMediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    gap: 6,
  },
  changeMediaText: {
    color: '#FF8D00',
    fontSize: 15,
    fontWeight: '600',
  },
  inputGroup: {
    width: '100%',
    marginBottom: responsiveValues.spacingLarge,
    zIndex: 1,
  },
  inputLabel: {
    fontWeight: '600',
    fontSize: responsiveValues.labelSize,
    marginBottom: 8,
    color: '#666',
  },
  inputField: {
    minHeight: responsiveValues.inputHeight,
    fontSize: responsiveValues.inputSize,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: responsiveValues.spacing,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#222',
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: responsiveValues.spacing,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 10,
    height: responsiveValues.inputHeight,
  },
  locationInput: {
    flex: 1,
    fontSize: responsiveValues.inputSize,
    color: '#222',
    height: '100%',
  },
  uploadingArea: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  uploadingText: {
    marginBottom: 8,
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  uploadingBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  uploadingBar: {
    height: 6,
    backgroundColor: '#FF8D00',
    borderRadius: 3,
  },
  shareButton: {
    width: '100%',
    backgroundColor: '#FF8D00',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonDisabled: {
    backgroundColor: '#ccc',
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  locationDropdown: {
    position: 'absolute',
    top: responsiveValues.inputHeight + 4,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 200,
    zIndex: 1000,
    elevation: 4,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  locationName: {
    color: '#222',
    fontSize: 14,
    fontWeight: '600',
  },
  locationAddress: {
    color: '#999',
    fontSize: 12,
  },
});
