import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

type ConversationItemProps = {
  item: any;
  userId: string | null;
  onPress: (item: any) => void;
  onLongPress: (item: any) => void;
  formatTime: (ts: any) => string;
  profilesById: Record<string, any>;
};

const ConversationItem: React.FC<ConversationItemProps> = ({
  item,
  userId,
  onPress,
  onLongPress,
  formatTime,
  profilesById,
}) => {
  const isGroup = !!item?.isGroup;
  const otherUserId = item?.otherUserId || item.participants?.find((uid: string) => uid !== userId);
  const profile = otherUserId ? profilesById?.[String(otherUserId)] : null;

  const displayName = isGroup
    ? (item?.groupName || 'Group chat')
    : (profile?.displayName || profile?.username || item?.otherUserName || 'User');

  const avatar = isGroup
    ? (item?.groupAvatar || DEFAULT_AVATAR_URL)
    : (profile?.avatar || profile?.photoURL || item?.otherUserAvatar || DEFAULT_AVATAR_URL);

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
        <View style={[styles.avatarRing, hasUnread && styles.avatarRingUnread]}>
          <Image source={{ uri: avatar }} style={styles.avatar} />
        </View>
      </View>

      <View style={styles.chatContent}>
        <Text style={[styles.username, hasUnread && styles.usernameBold]} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={[styles.preview, hasUnread && styles.previewBold]} numberOfLines={1}>
          {hasUnread ? `${item.unreadCount} new messages` : lastMsg} · {formatTime(item.lastMessageAt)}
        </Text>
      </View>

      <View style={styles.chatRight}>
        {hasUnread ? <View style={styles.blueDot} /> : <View style={{ width: 10 }} />}
        <Feather name="camera" size={22} color={hasUnread ? '#262626' : '#c7c7c7'} />
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
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  avatarRingUnread: {
    borderColor: '#0095f6',
    borderWidth: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#efefef',
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
    backgroundColor: '#0095f6',
    marginRight: 12,
  },
});

export default React.memo(ConversationItem);
