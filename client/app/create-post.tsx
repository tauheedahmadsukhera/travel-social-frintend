import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView, StyleSheet, ScrollView, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Hook & Components
import { useCreatePost, isVideoUri } from '../hooks/useCreatePost';
import MediaPicker from '@/src/_components/CreatePost/MediaPicker';
import MediaPreview from '@/src/_components/CreatePost/MediaPreview';
import PostDetailsForm from '@/src/_components/CreatePost/PostDetailsForm';

// Modals
import CategoryModal from '@/src/_components/CreatePost/CategoryModal';
import LocationModal from '@/src/_components/CreatePost/LocationModal';
import VerifiedLocationModal from '@/src/_components/CreatePost/VerifiedLocationModal';
import TagPeopleModal from '@/src/_components/CreatePost/TagPeopleModal';
import VisibilityModal from '@/src/_components/CreatePost/VisibilityModal';

import { DEFAULT_CATEGORIES } from '../lib/firebaseHelpers/index';
import { hapticLight } from '../lib/haptics';

const EMPTY_THUMBNAILS = {};

export default function CreatePostScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const {
    step, setStep, loading, caption, setCaption, hashtags, setHashtags,
    hashtagInput, setHashtagInput, visibility, setVisibility,
    selectedGroupId, setSelectedGroupId, userGroups,
    selectedImages, setSelectedImages, location, setLocation,
    verifiedLocation, setVerifiedLocation, taggedUsers, setTaggedUsers,
    selectedCategories, setSelectedCategories, categories,
    galleryAssets, loadingGallery, handleShare, handleHashtagCommit,
    locationSearch, locationResults, loadingLocationResults, handleLocationSearch,
    verifiedSearch, setVerifiedSearch, verifiedResults, loadingVerifiedResults, verifiedOptions, verifiedCenter,
    userSearch, userResults, loadingUserResults, handleUserSearch,
    categorySearch, setCategorySearch, isEditMode,
    galleryEndCursor, handleCamera, loadGalleryAssets, handleVerifiedSearch,
    fetchNearbyVerifiedLocations
  } = useCreatePost(params);

  // Modal visibility states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showVerifiedModal, setShowVerifiedModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);

  const getLocationKey = (loc: any) => {
    if (!loc) return '';
    if (loc.placeId || loc.place_id) return loc.placeId || loc.place_id;
    const lat = Number(loc.lat || loc.latitude || 0).toFixed(5);
    const lon = Number(loc.lon || loc.longitude || 0).toFixed(5);
    return `${loc.name}_${lat}_${lon}`;
  };
  const dummyPanHandlers = { onStartShouldSetResponder: () => true, onMoveShouldSetResponder: () => true };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={["top"]}>
      {step === 'picker' ? (
        <MediaPicker
          assets={galleryAssets || []}
          selectedImages={selectedImages || []}
          onSelect={(uri) => {
            hapticLight();
            if (selectedImages.includes(uri)) {
              setSelectedImages(selectedImages.filter(i => i !== uri));
            } else {
              if ((selectedImages || []).length >= 25) {
                Alert.alert('Limit Reached', 'You can select up to 25 photos or videos.');
                return;
              }
              const asset = (galleryAssets || []).find(a => a.uri === uri);
              if (asset && asset.mediaType === 'video' && asset.duration && asset.duration > 2520) {
                Alert.alert('Video Too Long', 'Videos in posts must be 42 minutes or shorter.');
                return;
              }
              setSelectedImages([...(selectedImages || []), uri]);
            }
          }}
          onCamera={handleCamera} 
          onLoadMore={() => loadGalleryAssets(galleryEndCursor)}
          onNext={() => {
            hapticLight();
            setStep('details');
          }}
          onBack={() => router.back()}
          canNext={(selectedImages || []).length > 0}
          loading={loadingGallery}
        />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' }}>
              <TouchableOpacity 
                onPress={() => isEditMode ? router.back() : setStep('picker')} 
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="x" size={20} color="#000" />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '600' }}>{isEditMode ? 'Edit post' : 'New post'}</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView style={{ flex: 1 }}>
              <MediaPreview
                uris={selectedImages}
                thumbnails={EMPTY_THUMBNAILS}
                isVideo={(uri) => isVideoUri(uri, galleryAssets)}
                height={350}
                onRemove={(index) => {
                  const updated = [...selectedImages];
                  updated.splice(index, 1);
                  setSelectedImages(updated);
                }}
              />
              <PostDetailsForm
                caption={caption}
                setCaption={setCaption}
                hashtags={hashtags}
                hashtagInput={hashtagInput}
                onHashtagInputChange={setHashtagInput}
                onHashtagCommit={handleHashtagCommit}
                onRemoveTag={(tag) => setHashtags(hashtags.filter(t => t !== tag))}
                selectedCategories={selectedCategories}
                onOpenCategories={() => setShowCategoryModal(true)}
                onRemoveCategory={(name) => setSelectedCategories(selectedCategories.filter(c => c.name !== name))}
                locationName={location?.name}
                onOpenLocation={() => setShowLocationModal(true)}
                verifiedLocation={verifiedLocation}
                onOpenVerifiedLocation={() => {
                  setShowVerifiedModal(true);
                  fetchNearbyVerifiedLocations();
                }}
                taggedUsers={taggedUsers}
                onOpenTagPeople={() => setShowTagModal(true)}
                onRemoveTaggedUser={(uid) => setTaggedUsers(taggedUsers.filter(u => u.uid !== uid))}
                visibility={visibility}
                onOpenVisibility={() => setShowVisibilityModal(true)}
              />
            </ScrollView>

            {/* Footer */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: (insets.bottom || 20) + 5 }}>
              <TouchableOpacity onPress={() => {
                setCaption('');
                setHashtags([]);
                setLocation(null);
                setVerifiedLocation(null);
                setTaggedUsers([]);
                setSelectedCategories([]);
              }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#333' }}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={{ backgroundColor: '#FF8D00', paddingHorizontal: 35, paddingVertical: 12, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{isEditMode ? 'Save' : 'Share'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <CategoryModal
        visible={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={categories.length > 0 ? categories : DEFAULT_CATEGORIES.map(c => typeof c === 'string' ? { name: c, image: '' } : c)}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        categorySearch={categorySearch}
        onSearchChange={setCategorySearch}
        panHandlers={dummyPanHandlers as any}
        iosSheetKeyboardOffset={0}
      />
      
      <LocationModal
        visible={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        locationSearch={locationSearch}
        onSearchChange={handleLocationSearch}
        loadingLocationResults={loadingLocationResults}
        locationResults={locationResults}
        location={location}
        setLocation={(loc) => {
          setLocation(loc);
          if (loc) setVerifiedLocation(null);
        }}
        getLocationKey={getLocationKey}
        panHandlers={dummyPanHandlers as any}
        iosSheetKeyboardOffset={0}
      />

      <VerifiedLocationModal
        visible={showVerifiedModal}
        onClose={() => setShowVerifiedModal(false)}
        verifiedSearch={verifiedSearch}
        onSearchChange={handleVerifiedSearch}
        loadingVerifiedResults={loadingVerifiedResults}
        verifiedResults={verifiedResults}
        verifiedOptions={verifiedOptions}
        verifiedLocation={verifiedLocation}
        setVerifiedLocation={(loc) => {
          setVerifiedLocation(loc);
          if (loc) setLocation(null);
        }}
        getLocationKey={getLocationKey}
        verifiedCenter={verifiedCenter}
        panHandlers={dummyPanHandlers as any}
        iosSheetKeyboardOffset={0}
      />

      <TagPeopleModal
        visible={showTagModal}
        onClose={() => setShowTagModal(false)}
        userSearch={userSearch}
        onSearchChange={handleUserSearch}
        loadingUserResults={loadingUserResults}
        userResults={userResults}
        taggedUsers={taggedUsers}
        setTaggedUsers={setTaggedUsers}
        panHandlers={dummyPanHandlers as any}
        iosSheetKeyboardOffset={0}
      />

      <VisibilityModal
        visible={showVisibilityModal}
        onClose={() => setShowVisibilityModal(false)}
        visibility={visibility}
        setVisibility={setVisibility}
        selectedGroupId={selectedGroupId}
        setSelectedGroupId={setSelectedGroupId}
        userGroups={userGroups}
        panHandlers={dummyPanHandlers as any}
      />

      {loading && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }]}>
          <ActivityIndicator size="large" color="#FF8D00" />
        </View>
      )}
    </SafeAreaView>
  );
}
