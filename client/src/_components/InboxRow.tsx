import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { getFormattedActiveStatus, subscribeToUserPresence, UserPresence } from '../../lib/userPresence';
import { useUserProfile } from '../_hooks/useUserProfile';
import MessageBubble from './MessageBubble';

export default function InboxRow({ item, router, unread, formatTime, DEFAULT_AVATAR_URL }: any) {
  // Use the hook to fetch the other user's profile
  // Fallback for missing otherUser
  // Guard against missing otherUser
  let otherUserId = '';
  if (item.otherUser && typeof item.otherUser.id === 'string') {
    otherUserId = item.otherUser.id;
  } else if (Array.isArray(item.participants) && item.currentUserId) {
    otherUserId = item.participants.find((uid: string) => uid !== item.currentUserId) || '';
  }
  
  if (__DEV__) {
    console.log('📱 InboxRow rendering:', { otherUserId, participantsCount: item.participants?.length, currentUserId: item.currentUserId });
  }
  
  const { profile, loading } = useUserProfile(otherUserId);

  const isLikelyOpaqueId = (value: any) => {
    const s = String(value || '').trim();
    if (!s) return false;
    if (/^\+?\d{6,}$/.test(s)) return true;
    if (/^[a-f0-9]{24}$/i.test(s)) return true;
    return false;
  };

  const isPlaceholderName = (value: any) => {
    const s = String(value || '').trim();
    if (!s) return true;
    const lower = s.toLowerCase();
    return lower === 'user' || lower === 'unknown';
  };

  const username = (() => {
    const candidates = [profile?.displayName, profile?.name, profile?.username]
      .map((v: any) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    for (const c of candidates) {
      if (isLikelyOpaqueId(c)) continue;
      if (isPlaceholderName(c)) continue;
      return c;
    }
    return 'User';
  })();
  const avatar = profile?.avatar;
  
  if (__DEV__) {
    console.log('👤 InboxRow profile loaded:', { username, avatarExists: !!avatar, profileLoading: loading });
  }
  
  // Track user's active status
  const [presence, setPresence] = useState<UserPresence | null>(null);
  
  useEffect(() => {
    if (!otherUserId) return;
    
    const unsubscribe = subscribeToUserPresence(otherUserId, (p) => {
      setPresence(p);
    });
    
    return () => unsubscribe?.();
  }, [otherUserId]);
  
  // Fallback for avatar
  const safeAvatar = typeof avatar === 'string' && avatar.trim() !== '' ? avatar : DEFAULT_AVATAR_URL;
  
  // Get active status text
  const activeStatusText = getFormattedActiveStatus(presence);

  return (
    <TouchableOpacity
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }}
      onPress={() => {
        if (!otherUserId) {
          console.warn('❌ No otherUserId, cannot navigate to DM');
          return;
        }
        if (__DEV__) console.log('🔵 Navigating to DM:', { conversationId: item.id, otherUserId });
        router.push({ 
          pathname: '/dm', 
          params: { 
            conversationId: item.id,
            otherUserId: otherUserId,
            user: username
          } 
        });
      }}
    >
      <View style={[{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, unread > 0 && { borderWidth: 2, borderColor: '#0A3D62' }]}>
        <ExpoImage 
          key={safeAvatar + username}
          source={{ uri: safeAvatar }} 
          style={{ 
            width: 56, 
            height: 56, 
            borderRadius: 28, 
            backgroundColor: '#eee', 
            borderWidth: 2, 
            borderColor: '#ccc' 
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          onError={() => { if (__DEV__) console.log('❌ Avatar image failed to load:', safeAvatar); }}
        />
      </View>
      <View style={{ flex: 1, borderBottomWidth: 0, paddingRight: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Text style={[{ fontWeight: '700', fontSize: 15, color: '#111', flex: 1 }, unread > 0 && { color: '#111' }]} numberOfLines={1}>
              {username || otherUserId?.substring(0, 8) || 'User'}
            </Text>
            {presence?.isOnline && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#31a24c', marginLeft: 6 }} />
            )}
          </View>
          <Text style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <MessageBubble
              text={(typeof item.lastMessage === 'string' && item.lastMessage.trim() !== '') ? item.lastMessage : 'No messages yet'}
              imageUrl={null}
              createdAt={item.lastMessageAt}
              isSelf={false}
              editedAt={null}
              formatTime={formatTime}
              compact={true}
              showTail={false}
              id={`inbox_preview_${item.id}`}
            />
          </View>
          {unread > 0 ? (
            <View style={{ backgroundColor: '#e0245e', minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{unread > 9 ? '9+' : unread}</Text></View>
          ) : (
            <Feather name="chevron-right" size={18} color="#ccc" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

