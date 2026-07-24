import React from 'react';
import { Image, Text, View } from 'react-native';
import { DEFAULT_AVATAR_URL } from '@/lib/api';


interface CustomMapMarkerProps {
  imageUrl?: string;
  imageUrls?: string[];
  userAvatar?: string;
  isLive?: boolean;
}

const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

export const CustomMapMarker: React.FC<CustomMapMarkerProps> = ({ imageUrl, imageUrls, userAvatar, isLive }) => {
  // Get post image
  const postImage = imageUrl || imageUrls?.[0] || DEFAULT_AVATAR;
  const avatarImage = userAvatar || DEFAULT_AVATAR;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Post Image - Main marker */}
      <View style={{
        width: 48,
        height: 48,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
      }}>
        <Image
          source={{ uri: postImage }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />

        {/* LIVE badge */}
        {isLive && (
          <View style={{
            position: 'absolute',
            top: 2,
            right: 2,
            backgroundColor: '#FF0000',
            borderRadius: 4,
            paddingHorizontal: 4,
            paddingVertical: 1,
          }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 8 }}>LIVE</Text>
          </View>
        )}
      </View>

      {/* User Avatar - Bottom right overlay */}
      <View style={{
        position: 'absolute',
        bottom: -6,
        right: -6,
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#fff',
        overflow: 'hidden',
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
      }}>
        <Image
          source={{ uri: avatarImage }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>
    </View>
  );
};

export default CustomMapMarker;
