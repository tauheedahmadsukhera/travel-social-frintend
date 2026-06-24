import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, Dimensions, Platform, ActivityIndicator, Image as RNImage } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { GalleryAsset, isVideoUri } from '../../../hooks/useCreatePost';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = width / 3;

const VideoThumbnailImage: React.FC<{ uri: string; mediaType: 'photo' | 'video' }> = ({ uri, mediaType }) => {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    if (mediaType !== 'video') return;
    
    // On iOS, RNImage can render ph:// video URIs natively
    if (Platform.OS === 'ios' && (uri.startsWith('ph://') || uri.startsWith('assets-library://'))) {
      setThumbUri(uri);
      return;
    }

    let active = true;
    async function gen() {
      try {
        const { uri: tUri } = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000 });
        if (active && tUri) {
          setThumbUri(tUri);
        }
      } catch (e) {
        console.warn('[VideoThumbnailImage] Failed to generate thumbnail:', e);
      }
    }
    gen();
    return () => {
      active = false;
    };
  }, [uri, mediaType]);

  if (mediaType === 'video') {
    if (Platform.OS === 'ios' && (uri.startsWith('ph://') || uri.startsWith('assets-library://'))) {
      return (
        <RNImage 
          source={{ uri }} 
          style={{ flex: 1 }} 
          resizeMode="cover"
        />
      );
    }
    return thumbUri ? (
      <ExpoImage 
        source={{ uri: thumbUri }} 
        style={{ flex: 1 }} 
        contentFit="cover"
        transition={200}
      />
    ) : (
      <View style={{ flex: 1, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="small" color="#FF8D00" />
      </View>
    );
  }

  return (
    <ExpoImage 
      source={{ uri }} 
      style={{ flex: 1 }} 
      contentFit="cover"
      transition={200}
    />
  );
};

interface MediaPickerProps {
  assets: GalleryAsset[];
  selectedImages: string[];
  onSelect: (uri: string) => void;
  onCamera: () => void;
  onLoadMore: () => void;
  onNext: () => void;
  onBack: () => void;
  canNext: boolean;
  loading: boolean;
}

const MediaPicker: React.FC<MediaPickerProps> = ({ assets, selectedImages, onSelect, onCamera, onLoadMore, onNext, onBack, canNext, loading }) => {
  const renderItem = ({ item }: { item: GalleryAsset }) => {
    const isSelected = selectedImages.includes(item.uri);
    const index = selectedImages.indexOf(item.uri);

    return (
      <TouchableOpacity
        onPress={() => onSelect(item.uri)}
        style={{ width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, padding: 1 }}
      >
        <VideoThumbnailImage uri={item.uri} mediaType={item.mediaType} />
        {item.mediaType === 'video' && (
          <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="video" size={10} color="#fff" />
            {typeof item.duration === 'number' && (
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <View style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF8D00', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{index + 1}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#efefef' }}>
        <TouchableOpacity onPress={onBack} style={{ backgroundColor: '#f0f0f0', padding: 8, borderRadius: 20 }}>
          <Feather name="x" size={20} color="#000" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Recent</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={onCamera} style={{ backgroundColor: '#f0f0f0', padding: 8, borderRadius: 20, marginRight: 15 }}>
            <Feather name="camera" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={onNext} 
            disabled={!canNext}
            style={{ opacity: canNext ? 1 : 0.4 }}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#FBBC04', '#FF8D00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 14,
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Next</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
      <FlashList
        data={assets}
        extraData={selectedImages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <View style={{ padding: 20 }}><Text>Loading...</Text></View> : null}
        estimatedItemSize={GRID_ITEM_SIZE}
      />
    </View>
  );
};

export default MediaPicker;
