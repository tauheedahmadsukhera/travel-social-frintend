import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { styles } from './PostCard.styles';
import { resolveAvatarUrl } from '../../../lib/utils/avatar';
import VerifiedBadge from '../VerifiedBadge';

interface PostHeaderProps {
  post: any;
  postUserName: string;
  postUserAvatar: string;
  locationName: string;
  postTimeText: string;
  onProfilePress: () => void;
  onLocationPress: () => void;
  onMenuPress: () => void;
  showMenu: boolean;
}

const PostHeader: React.FC<PostHeaderProps> = ({
  post,
  postUserName,
  postUserAvatar,
  locationName,
  postTimeText,
  onProfilePress,
  onLocationPress,
  onMenuPress,
  showMenu,
}) => {
  return (
    <View style={styles.cardHeader}>
      <TouchableOpacity onPress={onProfilePress} activeOpacity={0.7}>
        <ExpoImage
          source={{ uri: resolveAvatarUrl(postUserAvatar) }}
          style={styles.cardHeaderAvatar}
          contentFit="cover"
        />
      </TouchableOpacity>
      <View style={styles.cardHeaderInfo}>
        <TouchableOpacity 
          onPress={onProfilePress} 
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={styles.cardHeaderName} numberOfLines={1}>{postUserName}</Text>
          {(post?.userId?.verified || post?.user?.verified || post?.userId?.isVerified || post?.user?.isVerified) && <VerifiedBadge size={14} />}
        </TouchableOpacity>
        <View style={[styles.cardHeaderSubRow, { flexWrap: 'nowrap' }]}>
          {locationName ? (
            <TouchableOpacity 
              onPress={onLocationPress} 
              style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
            >
              <Text style={[styles.cardHeaderLocation, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                {locationName}
              </Text>
              {post?.locationData?.verified && (
                <View style={{ marginLeft: 3 }}>
                  <VerifiedBadge size={12} color="#000" />
                </View>
              )}
              <View style={styles.cardHeaderDot} />
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.cardHeaderDate, { flexShrink: 0 }]}>{postTimeText}</Text>
        </View>
      </View>
      {showMenu && (
        <TouchableOpacity onPress={onMenuPress} style={{ padding: 4 }}>
          <Feather name="more-vertical" size={20} color="#666" />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default React.memo(PostHeader);
