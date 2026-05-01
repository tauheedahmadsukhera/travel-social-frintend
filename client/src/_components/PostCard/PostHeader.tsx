import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ExpoImage } from 'expo-image';
import { Feather } from "@expo/vector-icons";
import { styles } from './PostCard.styles';
import { DEFAULT_AVATAR_URL } from '../../../lib/api';
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
          source={{ uri: postUserAvatar || DEFAULT_AVATAR_URL }}
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
          {post?.user?.verified && <VerifiedBadge size={14} />}
        </TouchableOpacity>
        <View style={styles.cardHeaderSubRow}>
          {locationName ? (
            <TouchableOpacity onPress={onLocationPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.cardHeaderLocation} numberOfLines={1}>{locationName}</Text>
              <View style={styles.cardHeaderDot} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.cardHeaderDate}>{postTimeText}</Text>
        </View>
      </View>
      {showMenu && (
        <TouchableOpacity onPress={onMenuPress} style={{ padding: 4 }}>
          <Feather name="more-horizontal" size={20} color="#666" />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default React.memo(PostHeader);
