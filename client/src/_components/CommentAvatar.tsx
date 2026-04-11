import { DEFAULT_AVATAR_URL } from '../../lib/api';
import React from 'react';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { TouchableOpacity } from 'react-native';
import { useUserProfile } from '../_hooks/useUserProfile';

export default function CommentAvatar({ userId, userAvatar, size = 36 }: { userId: string, userAvatar?: string, size?: number }) {
  const router = useRouter();
  const { profile } = useUserProfile(userId);
  const [failed, setFailed] = React.useState(false);
  

  const normalizeAvatar = (value: any): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
    return trimmed;
  };

  const isGenericDefaultAvatar = (value: string): boolean => {
    const v = String(value || '').toLowerCase();
    if (!v) return true;
    return (
      v.includes('via.placeholder.com/200x200.png?text=profile') ||
      v.includes('/default%2fdefault-pic.jpg') ||
      v.includes('/default/default-pic.jpg')
    );
  };

  // iOS Fix: Check all three avatar fields for consistency
  const avatar = normalizeAvatar(profile?.avatar || profile?.photoURL);
  const fallbackAvatar = normalizeAvatar(userAvatar);
  const preferredAvatar =
    (fallbackAvatar && !isGenericDefaultAvatar(fallbackAvatar) ? fallbackAvatar : '') ||
    (avatar && !isGenericDefaultAvatar(avatar) ? avatar : '') ||
    fallbackAvatar ||
    avatar;
  const avatarUri = failed
    ? DEFAULT_AVATAR_URL
    : (preferredAvatar || DEFAULT_AVATAR_URL);

  React.useEffect(() => {
    setFailed(false);
  }, [avatar, fallbackAvatar, userId]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={!userId}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => {
        if (!userId) return;
        router.push({ pathname: '/user-profile', params: { id: userId } } as any);
      }}
    >
      <ExpoImage
        source={{ uri: avatarUri }}
        style={{ width: size, height: size, borderRadius: size / 2, marginRight: 12 }}
        contentFit="cover"
        cachePolicy="memory-disk"
        onError={() => setFailed(true)}
      />
    </TouchableOpacity>
  );
}
