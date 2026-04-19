import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { getAPIBaseURL } from '../../config/environment';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createPost, searchUsers } from '../../lib/firebaseHelpers/index';
import { useUser } from '@/src/_components/UserContext';
import VerifiedBadge from '@/src/_components/VerifiedBadge';
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { safeRouterBack } from '@/lib/safeRouterBack';

// Runtime import of ImagePicker with graceful fallback
let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.warn('expo-image-picker not available');
}



export default function PostScreen() {
    // Default avatar from Firebase Storage
    
  const router = useRouter();
  const user = useUser();
  const { showSuccess } = useAppDialog();
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState<any>(null);
  const [verifiedLocation, setVerifiedLocation] = useState<any>(null);
  const [taggedUsers, setTaggedUsers] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showVerifiedModal, setShowVerifiedModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [locationResults, setLocationResults] = useState<any[]>([]);

  useEffect(() => {
    loadUsers();
    loadGalleryImages();
    fetchLocations();
  }, []);

  const loadUsers = async () => {
    setLoadingUsers(true);
    const result = await searchUsers("", 20);
    if (result.success) {
      setUsers(result.data);
    }
    setLoadingUsers(false);
  };

  const loadGalleryImages = async () => {
    if (!ImagePicker) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.granted) {
        // For demo, we'll use placeholder images
        // In production, you'd fetch actual gallery images
        // setGalleryImages([]);
      }
    } catch (err) {
      console.warn('Gallery permission error', err);
    }
  };

  // Fetch locations from backend
  const fetchLocations = async () => {
    try {
      const response = await fetch(`${getAPIBaseURL()}/locations`);
      const data = await response.json();
      if (Array.isArray(data)) setLocationResults(data);
    } catch (err) {
      setLocationResults([]);
    }
  };

  async function pickImage() {
    if (!ImagePicker) {
      Alert.alert('Not available', 'Image picker not installed. Run: npx expo install expo-image-picker');
      return;
    }
    hapticLight();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow access to your photos.');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
        allowsMultipleSelection: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uris = result.assets.map((asset: any) => asset.uri);
        setSelectedImages(uris);
        setShowImagePicker(false);
      }
    } catch (err) {
      console.warn('ImagePicker error', err);
      Alert.alert('Error', 'Failed to pick image');
    }
  }

  async function handleShare() {
    if (selectedImages.length === 0) {
      Alert.alert('No image', 'Please select an image first');
      return;
    }
    hapticMedium();
    // const user = getCurrentUser() as { uid: string } | null;
    // if (!user || !user.uid) {
    //   Alert.alert('Not signed in', 'Please sign in to create a post');
    //   router.replace('/auth/welcome');
    //   return;
    // }
    // TODO: Use user from context or props
    
    setLoading(true);
    try {
      const result = await createPost(user.uid, selectedImages, caption, location?.name || '');
      if (result && typeof result.success === 'boolean' && result.success) {
        hapticSuccess();
        showSuccess('Post created successfully!', {
          onOk: () => {
            setSelectedImages([]);
            setCaption('');
            setLocation(null);
            setVerifiedLocation(null);
            setTaggedUsers([]);
            router.push('/(tabs)/home?refresh=1');
          },
        });
      } else {
        Alert.alert('Error', 'Failed to create post');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              safeRouterBack();
            }}
          >
            <Feather name="x" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>New post</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={{ flex: 1 }}>
          {/* Main Image Preview */}
          {selectedImages.length > 0 ? (
            <View>
              <Image source={{ uri: selectedImages[0] }} style={styles.mainImage} />
              
              {/* Small Image Grid */}
              <View style={styles.gridContainer}>
                {selectedImages.map((uri, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={[styles.gridItem, index === 0 && styles.gridItemActive]}
                    onPress={() => {
                      hapticLight();
                      const newImages = [...selectedImages];
                      [newImages[0], newImages[index]] = [newImages[index], newImages[0]];
                      setSelectedImages(newImages);
                    }}
                  >
                    <Image source={{ uri }} style={styles.gridImage} />
                    {index === 0 && <View style={styles.activeIndicator} />}
                  </TouchableOpacity>
                ))}
                {selectedImages.length < 4 && (
                  <TouchableOpacity
                    style={styles.gridItem}
                    onPress={() => {
                      hapticLight();
                      setShowImagePicker(true);
                    }}
                  >
                    <View style={styles.addMore}>
                      <Feather name="plus" size={20} color="#999" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.imagePlaceholder}
              onPress={() => {
                hapticLight();
                setShowImagePicker(true);
              }}
            >
              <Feather name="image" size={48} color="#ccc" />
              <Text style={styles.placeholderText}>Tap to select image</Text>
            </TouchableOpacity>
          )}

          {/* Post Options */}
          <View style={styles.options}>
            {/* Caption */}
            <TouchableOpacity style={styles.optionRow} onPress={() => {}}>
              <MaterialIcons name="notes" size={20} color="#000" style={{ marginRight: 12 }} />
              <TextInput
                placeholder="Add a caption"
                value={caption}
                onChangeText={setCaption}
                style={styles.captionInput}
                multiline={false}
                placeholderTextColor="#999"
              />
            </TouchableOpacity>

            {/* Add Tags */}
            <TouchableOpacity style={styles.optionRow}>
              <Feather name="hash" size={20} color="#000" style={{ marginRight: 12 }} />
              <Text style={styles.optionText}>Add tags</Text>
              <Feather name="chevron-right" size={20} color="#999" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            {/* Add Category */}
            <TouchableOpacity style={styles.optionRow}>
              <Feather name="bookmark" size={20} color="#000" style={{ marginRight: 12 }} />
              <Text style={styles.optionText}>Add a category for the home feed</Text>
              <Feather name="chevron-right" size={20} color="#999" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            {/* Location */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                hapticLight();
                setShowLocationModal(true);
              }}
            >
              <Feather name="map-pin" size={20} color="#000" style={{ marginRight: 12 }} />
              <Text style={styles.optionText}>
                {location ? location.name : "Add a location"}
              </Text>
              <Feather name="chevron-right" size={20} color="#999" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            {/* Verified Location */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                hapticLight();
                setShowVerifiedModal(true);
              }}
            >
              <View style={{ marginRight: 12 }}><VerifiedBadge size={20} color="#000" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionText}>
                  {verifiedLocation ? "Verified location added" : "Add a verified location"}
                </Text>
                {verifiedLocation && (
                  <View style={styles.verifiedInfo}>
                    <Text style={styles.verifiedName}>{verifiedLocation.name}</Text>
                    <Text style={styles.verifiedAddress}>{verifiedLocation.address}</Text>
                  </View>
                )}
              </View>
              {verifiedLocation ? (
                <TouchableOpacity
                  onPress={() => {
                    hapticLight();
                    setVerifiedLocation(null);
                  }}
                >
                  <Feather name="x" size={20} color="#000" />
                </TouchableOpacity>
              ) : (
                <Feather name="chevron-right" size={20} color="#999" />
              )}
            </TouchableOpacity>

            {/* Tag People */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                hapticLight();
                setShowTagModal(true);
              }}
            >
              <Feather name="users" size={20} color="#000" style={{ marginRight: 12 }} />
              <Text style={styles.optionText}>Tag people</Text>
              <Feather name="chevron-right" size={20} color="#999" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            {/* Post Visibility */}
            <TouchableOpacity style={styles.optionRow}>
              <Feather name="eye" size={20} color="#000" style={{ marginRight: 12 }} />
              <Text style={styles.optionText}>Post visibility</Text>
              <Feather name="chevron-right" size={20} color="#999" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Share Button Box - Fixed at bottom */}
        <View style={styles.bottomBar}>
          <TouchableOpacity 
            style={styles.clearAllBottomBtn} 
            onPress={() => {
              hapticLight();
              setCaption(""); setLocation(null); setVerifiedLocation(null); setTaggedUsers([]); setSelectedImages([]);
            }}
          >
            <Text style={styles.clearAllBottomText}>Clear all</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.shareBtn, (loading || selectedImages.length === 0) && styles.shareBtnDisabled]} 
            onPress={handleShare}
            disabled={loading || selectedImages.length === 0}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.shareBtnText}>Share</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Image Picker Modal */}
      <Modal visible={showImagePicker} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity
              onPress={() => {
                hapticLight();
                setShowImagePicker(false);
              }}
            >
              <Feather name="x" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Select photos</Text>
            <TouchableOpacity onPress={pickImage}>
              <Text style={styles.pickerDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="image" size={64} color="#666" />
            <Text style={{ color: '#999', marginTop: 16 }}>Tap Done to select from gallery</Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Location Modal */}
      <Modal visible={showLocationModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowLocationModal(false)}
            />
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Choose a location to tag</Text>
              <Text style={styles.modalSubtitle}>
                Here are the locations around you. We use it to make sure people share the place they tag.
              </Text>
              <View style={styles.searchContainer}>
                <Feather name="search" size={18} color="#999" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Search location..."
                  style={styles.searchInputField}
                  placeholderTextColor="#999"
                  value={locationInput}
                  onChangeText={setLocationInput}
                />
              </View>
            <FlatList
              data={locationResults}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: { item: any }) => (
                <TouchableOpacity
                  style={styles.locationItem}
                  onPress={() => {
                    setLocation(item);
                    setShowLocationModal(false);
                  }}
                >
                  <Feather name="map-pin" size={22} color="#000" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationName}>{item.name}</Text>
                    <Text style={styles.locationAddress}>{item.address}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => setShowLocationModal(false)}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Verified Location Modal */}
      <Modal visible={showVerifiedModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowVerifiedModal(false)}
            />
            <View style={styles.modalBox}>
            <View style={styles.verifiedHeader}>
              <VerifiedBadge size={24} color="#000" />
              <Text style={styles.modalTitle}>Add a verified location</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              To add a verified location you must be within 50 meters.
            </Text>
            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color="#999" style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Search"
                style={styles.searchInputField}
                placeholderTextColor="#999"
              />
            </View>
            <FlatList
              data={locationResults}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.locationItem}
                  onPress={() => {
                    setVerifiedLocation(item);
                    setShowVerifiedModal(false);
                  }}
                >
                  <Feather name="map-pin" size={22} color="#000" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationName}>{item.name}</Text>
                    <Text style={styles.locationAddress}>{item.address}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowVerifiedModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={() => setShowVerifiedModal(false)}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => setShowVerifiedModal(false)}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tag People Modal */}
      <Modal visible={showTagModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowTagModal(false)}
            />
            <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Tag someone</Text>
            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color="#999" style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Search user"
                style={styles.searchInputField}
                placeholderTextColor="#999"
              />
            </View>
            {loadingUsers ? (
              <ActivityIndicator color="#0A3D62" style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={users}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userItem}
                    onPress={() => {
                      if (!taggedUsers.some((u: any) => u.id === item.id)) {
                        setTaggedUsers([...taggedUsers, item]);
                      }
                      setShowTagModal(false);
                    }}
                  >
                    <Image 
                      source={{ uri: item.photoURL || DEFAULT_AVATAR_URL }} 
                      style={styles.userAvatar} 
                    />
                    <Text style={styles.userName}>{item.displayName || "User"}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
              />
            )}
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setShowTagModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => setShowTagModal(false)}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd'
  },
  title: { fontWeight: '600', fontSize: 17, color: '#000' },
  mainImage: { width: '100%', aspectRatio: 1, backgroundColor: '#f5f5f5' },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center'
  },
  placeholderText: { color: '#999', marginTop: 12, fontSize: 15 },
  gridContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6
  },
  gridItem: {
    width: 60,
    height: 60,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    position: 'relative'
  },
  gridItemActive: { borderWidth: 2, borderColor: '#FFB800' },
  gridImage: { width: '100%', height: '100%' },
  activeIndicator: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFB800'
  },
  addMore: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5'
  },
  options: { paddingHorizontal: 16 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e5e5'
  },
  optionText: { color: '#000', fontSize: 16, flex: 1 },
  captionInput: { flex: 1, fontSize: 16, color: '#000', padding: 0 },
  verifiedInfo: { marginTop: 4 },
  verifiedName: { fontWeight: '600', fontSize: 13, color: '#000' },
  verifiedAddress: { color: '#666', fontSize: 12, marginTop: 2 },
  clearAll: { paddingVertical: 20, alignItems: 'center' },
  clearAllBtn: { paddingVertical: 20, alignItems: 'center' },
  clearAllText: { color: '#000', fontSize: 16 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#eee',
    backgroundColor: '#fff'
  },
  clearAllBottomBtn: {
    paddingVertical: 8,
  },
  clearAllBottomText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 16
  },
  shareBtn: {
    backgroundColor: '#0A3D62',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 100
  },
  shareBtnDisabled: { backgroundColor: '#ccc' },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  pickerTitle: { color: '#fff', fontWeight: '600', fontSize: 17 },
  pickerDone: { color: '#FFB800', fontWeight: '600', fontSize: 17 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 24,
    paddingHorizontal: 16,
    maxHeight: '80%'
  },
  modalTitle: { fontWeight: '600', fontSize: 18, color: '#000', marginBottom: 8 },
  modalSubtitle: { color: '#666', fontSize: 14, marginBottom: 16 },
  verifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    padding: 0
  },
  searchInputField: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    padding: 0
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e5e5'
  },
  locationName: { fontWeight: '600', fontSize: 15, color: '#000' },
  locationAddress: { color: '#666', fontSize: 13, marginTop: 3 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e5e5'
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: '#f0f0f0'
  },
  userName: { fontWeight: '500', fontSize: 15, color: '#000' },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 20, fontSize: 15 },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e5e5',
    marginTop: 16
  },
  cancelText: { color: '#000', fontWeight: '500', fontSize: 16 },
  saveBtn: {
    backgroundColor: '#FFB800',
    borderRadius: 6,
    paddingHorizontal: 24,
    paddingVertical: 10
  },
  saveButton: {
    backgroundColor: '#FFB800',
    borderRadius: 6,
    paddingHorizontal: 24,
    paddingVertical: 10
  },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  addButton: {
    backgroundColor: '#000',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 8
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#eee'
  }
});

