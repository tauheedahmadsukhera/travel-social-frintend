import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { getOptimizedImageUrl } from '../../../lib/imageHelpers';

let Marker: any = null;
if (Platform.OS !== 'web') {
  const RNMaps = require('react-native-maps');
  Marker = RNMaps.Marker;
}

interface ProfilePostMarkerProps {
  lat: number;
  lon: number;
  imageUrl: string;
  avatarUrl: string;
  onPress: () => void;
}

export const ProfilePostMarker: React.FC<ProfilePostMarkerProps> = ({ 
  lat, 
  lon, 
  imageUrl, 
  avatarUrl, 
  onPress 
}) => {
  const [tracks, setTracks] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setTracks(false), 20000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (imgLoaded && avatarLoaded) setTracks(false);
  }, [imgLoaded, avatarLoaded]);

  const markerImageUrl = getOptimizedImageUrl(imageUrl, 'map-marker');
  const markerAvatarUrl = getOptimizedImageUrl(avatarUrl, 'thumbnail');

  if (!Marker) return null;

  return (
    <Marker coordinate={{ latitude: lat, longitude: lon }} tracksViewChanges={tracks} onPress={onPress}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ backgroundColor: 'transparent' }}>
        <View style={{ position: 'relative', width: 48, height: 48 }}>
          <View style={{ 
            width: 48, 
            height: 48, 
            borderRadius: 12, 
            borderWidth: 2, 
            borderColor: '#ffa726', 
            overflow: 'hidden', 
            backgroundColor: '#fff', 
            justifyContent: 'center', 
            alignItems: 'center', 
            shadowColor: '#000', 
            shadowOffset: { width: 0, height: 2 }, 
            shadowOpacity: 0.2, 
            shadowRadius: 3, 
            elevation: 3 
          }}>
            <ExpoImage
              source={{ uri: markerImageUrl }}
              style={{ width: 44, height: 44, borderRadius: 10 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={150}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
          </View>
          <View style={{ 
            position: 'absolute', 
            top: -2, 
            right: -2, 
            width: 20, 
            height: 20, 
            borderRadius: 10, 
            borderWidth: 2, 
            borderColor: '#fff', 
            backgroundColor: '#fff', 
            justifyContent: 'center', 
            alignItems: 'center', 
            shadowColor: '#000', 
            shadowOffset: { width: 0, height: 1 }, 
            shadowOpacity: 0.2, 
            shadowRadius: 2, 
            elevation: 4 
          }}>
            <ExpoImage
              source={{ uri: markerAvatarUrl }}
              style={{ width: 16, height: 16, borderRadius: 8 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              onLoad={() => setAvatarLoaded(true)}
              onError={() => setAvatarLoaded(true)}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Marker>
  );
};
