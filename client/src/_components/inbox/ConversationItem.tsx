import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import VerifiedBadge from '../VerifiedBadge';

type ConversationItemProps = {
  item: any;
  userId: string | null;
  onPress: (item: any) => void;
  onLongPress: (item: any) => void;
  formatTime: (ts: any) => string;
  profilesById: Record<string, any>;
  onCameraPress?: (item: any) => void;
  isSendingMedia?: boolean;
};

const ConversationItem: React.FC<ConversationItemProps> = ({
  item,
  userId,
  onPress,
  onLongPress,
  formatTime,
  profilesById,
  onCameraPress,
  isSendingMedia,
}) => {
  const isGroup = !!item?.isGroup;
  const otherUserId = item?.otherUserId || item.participants?.find((uid: string) => uid !== userId);
  const profile = otherUserId ? profilesById?.[String(otherUserId)] : null;
  const embeddedUser = item?.otherUser || item?.otherUserProfile;

  const displayName = isGroup
    ? (item?.groupName || 'Group chat')
    : (profile?.displayName || profile?.username || embeddedUser?.displayName || embeddedUser?.name || item?.otherUserName || 'User');

  const avatar = isGroup
    ? (item?.groupAvatar || DEFAULT_AVATAR_URL)
    : (profile?.avatar || profile?.photoURL || embeddedUser?.avatar || embeddedUser?.photoURL || item?.otherUserAvatar || DEFAULT_AVATAR_URL);

  const isDefaultAvatar = !avatar || avatar === DEFAULT_AVATAR_URL || avatar.includes('avatardefault.webp');

  const hasUnread = typeof item?.unreadCount === 'number' && item.unreadCount > 0;
  const lastMsg = item.lastMessage || 'No messages yet';

  return (
    <TouchableOpacity
      style={styles.chatRow}
      activeOpacity={0.75}
      onLongPress={() => onLongPress(item)}
      onPress={() => onPress(item)}
    >
      <View style={styles.avatarContainer}>
        <View style={[styles.avatarRing, hasUnread && styles.avatarRingUnread, { overflow: 'hidden' }]}>
          {isDefaultAvatar ? (
            <View style={[styles.avatar, { backgroundColor: '#788d9a', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>
                {String(displayName || 'U').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : (
            <ExpoImage 
              source={{ uri: avatar }} 
              style={styles.avatar} 
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
          )}
        </View>
        {profile?.isOnline && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.chatContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.username, hasUnread && styles.usernameBold]} numberOfLines={1}>
            {displayName}
          </Text>
          {!!(!isGroup && (profile?.verified || profile?.isVerified || embeddedUser?.verified || embeddedUser?.isVerified || item?.otherUser?.verified || item?.otherUser?.isVerified)) && <VerifiedBadge size={14} />}
        </View>
        <Text style={[styles.preview, hasUnread && styles.previewBold]} numberOfLines={1}>
          {hasUnread ? `${item.unreadCount} new messages` : lastMsg} · {formatTime(item.lastMessageAt)}
        </Text>
      </View>

      <View style={styles.chatRight}>
        {hasUnread ? <View style={styles.blueDot} /> : <View style={{ width: 10 }} />}
        {isSendingMedia ? (
          <ActivityIndicator size="small" color="#FF8D00" style={{ marginRight: 4 }} />
        ) : (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onCameraPress?.(item);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="camera" size={22} color="#000" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingUnread: {
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
  },
  chatContent: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  usernameBold: {
    fontWeight: '700',
  },
  preview: {
    fontSize: 13,
    color: '#8e8e8e',
    marginTop: 2,
  },
  previewBold: {
    color: '#000',
    fontWeight: '600',
  },
  chatRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  blueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF8D00',
    marginRight: 12,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
});

export default React.memo(ConversationItem);
