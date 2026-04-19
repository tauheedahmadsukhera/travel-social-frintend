import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { DEFAULT_AVATAR_URL } from '@/lib/api';


interface ProfileAvatarProps {
  avatarUrl: string;
  isOwnProfile: boolean;
  onAvatarPress?: () => void;
  onChangeAvatar?: () => void;
  onAddStory?: () => void;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  avatarUrl,
  isOwnProfile,
  onAvatarPress,
  onChangeAvatar,
  onAddStory,
}) => (
  <View style={styles.avatarContainer}>
    <TouchableOpacity activeOpacity={0.8} onPress={onAvatarPress}>
      <ExpoImage
        source={{ uri: avatarUrl || DEFAULT_AVATAR_URL }}
        style={styles.avatar}
        contentFit="cover"
        transition={200}
      />
    </TouchableOpacity>
    {isOwnProfile && (
      <TouchableOpacity
        style={styles.changeAvatarOverlay}
        activeOpacity={0.6}
        onPress={onChangeAvatar}
      />
    )}
    {isOwnProfile && (
      <TouchableOpacity
        style={styles.addStoryBtn}
        onPress={onAddStory}
      >
        <Feather name="plus" size={20} color="#fff" />
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  avatarContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#eee' },
  changeAvatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  addStoryBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007aff', borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', zIndex: 2 },
});

export default ProfileAvatar;
