import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  TextInput, 
  FlatList, 
  Image, 
  Dimensions,
  ActivityIndicator,
  Platform,
  Linking,
  Share,
  Alert
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/apiService'; // Fixed import path
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { getAPIBaseURL } from '../../config/environment';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ShareModalProps = {
  visible: boolean;
  onClose: () => void;
  onSend: (userIds: string[]) => void;
  currentUserId: string | null;
  title?: string;
  modalVariant?: 'home' | 'chat';
  onAddToStory?: () => void;
  sharePayload?: any;
  useViewOverlay?: boolean;
};

const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;
const SHARE_MODAL_BUILD = 'share-modal-v2-2026-04-01';

export default function ShareModal({
  visible,
  onClose,
  onSend,
  currentUserId,
  title = 'Send to',
  modalVariant = 'chat',
  onAddToStory,
  sharePayload,
  useViewOverlay = false,
}: ShareModalProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);

  const handleSendPress = async () => {
    if (!currentUserId || selectedUsers.length === 0 || sendingMessage) return;
    setSendingMessage(true);
    try {
      const isStory = !!sharePayload?.isStory || sharePayload?.shareType === 'story';
      const shareType = isStory ? 'story' : 'post';
      const rawData = sharePayload?.data ?? sharePayload;
      
      const { getOrCreateConversation } = await import('../../lib/firebaseHelpers/conversation');
      const { sendPostMessage, sendStoryMessage } = await import('../../lib/firebaseHelpers/messages');

      let successCount = 0;

      for (const targetId of selectedUsers) {
        const targetProfile = users.find(u => String(u.id) === String(targetId));
        const targetIsGroup = (typeof targetId === 'string' && targetId.startsWith('grp_')) || !!targetProfile?.isGroup;
        let convoId = '';
        
        if (targetIsGroup) {
          convoId = targetId;
        } else {
          const res = await getOrCreateConversation(currentUserId, targetId);
          if (res?.success && res.conversationId) {
            convoId = String(res.conversationId);
          }
        }

        if (convoId) {
          if (shareType === 'story') {
            await sendStoryMessage(convoId, currentUserId, rawData, { recipientId: targetIsGroup ? undefined : targetId });
          } else {
            await sendPostMessage(convoId, currentUserId, rawData, { recipientId: targetIsGroup ? undefined : targetId });
          }
          successCount++;
        }
      }

      if (successCount > 0) {
        const label = isStory ? 'Story' : 'Post';
        Alert.alert('Shared', `${label} shared successfully to ${successCount} chat${successCount > 1 ? 's' : ''}.`);
      } else {
        Alert.alert('Error', 'Failed to share content.');
      }
    } catch (err) {
      console.error('[ShareModal] handleSendPress error:', err);
      Alert.alert('Error', 'An error occurred while sharing.');
    } finally {
      setSendingMessage(false);
      onClose();
      try {
        onSend(selectedUsers);
      } catch (err) {
        // ignore parent callback failures
      }
    }
  };

  const handleQuickAction = async (actionType: string) => {
    const postId = sharePayload?._id || sharePayload?.id || '';
    if (!postId) {
      Alert.alert('Error', 'Unable to share: Content ID is missing.');
      return;
    }

    const isStory = !!sharePayload?.isStory;
    const contentType = isStory ? 'story' : 'post';
    // Resolve share base URL dynamically:
    // EXPO_PUBLIC_SHARE_DOMAIN can be set in client .env (e.g. to "https://travelsocial.com" or a custom domain)
    // If not set, it defaults to the API base URL without the "/api" suffix.
    const customShareDomain = process.env.EXPO_PUBLIC_SHARE_DOMAIN || '';
    let shareBase = customShareDomain.trim().replace(/\/+$/, '');
    if (!shareBase) {
      const apiBase = getAPIBaseURL();
      shareBase = apiBase.replace(/\/api\/?$/, '');
    }
    const shareUrl = isStory 
      ? `${shareBase}/share/story/${postId}`
      : `${shareBase}/share/post/${postId}`;

    switch (actionType) {
      case 'story':
        onClose();
        if (onAddToStory) {
          onAddToStory();
        } else {
          router.push({
            pathname: '/story-creator',
            params: {
              sharePostId: postId,
              sharePostData: JSON.stringify(sharePayload)
            }
          } as any);
        }
        break;

      case 'whatsapp': {
        const text = `Check out this ${contentType} on Trips!\n\n${shareUrl}`;
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
        const webUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        try {
          const canOpen = await Linking.canOpenURL(whatsappUrl);
          if (canOpen) {
            await Linking.openURL(whatsappUrl);
          } else {
            await Linking.openURL(webUrl);
          }
        } catch {
          await Linking.openURL(webUrl);
        }
        onClose();
        break;
      }

      case 'copy_link':
        try {
          await Clipboard.setStringAsync(shareUrl);
          Alert.alert('Copied', 'Link copied to clipboard!');
        } catch (err) {
          Alert.alert('Error', 'Failed to copy link');
        }
        onClose();
        break;

      case 'whatsapp_status': {
        const text = `Check out my travel ${contentType} on Trips!\n\n${shareUrl}`;
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
        const webUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        try {
          const canOpen = await Linking.canOpenURL(whatsappUrl);
          if (canOpen) {
            await Linking.openURL(whatsappUrl);
          } else {
            await Linking.openURL(webUrl);
          }
        } catch {
          await Linking.openURL(webUrl);
        }
        onClose();
        break;
      }

      case 'share':
        try {
          await Share.share({
            message: `Check out this ${contentType} on Trips!\n\n${shareUrl}`,
            url: shareUrl,
            title: `Share ${isStory ? 'Story' : 'Post'}`
          });
        } catch (err) {
          console.error('[ShareModal] Native share error:', err);
        }
        onClose();
        break;

      default:
        break;
    }
  };

  useEffect(() => {
    if (visible && currentUserId) {
      console.log('[ShareModal] build:', SHARE_MODAL_BUILD);
      fetchRecentChats();
    } else {
      setUsers([]);
      setSearch('');
      setSelectedUsers([]);
    }
  }, [visible, currentUserId]);

  const fetchRecentChats = async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const res = await apiService.get(`/conversations?userId=${currentUserId}`);
      if (res?.success && Array.isArray(res.data)) {
        // Extract unique other users from conversations
        const profiles: any[] = [];
        const seenIds = new Set();
        const unresolvedIds: string[] = [];
        
        res.data.forEach((convo: any) => {
          if (convo.isGroup) {
            profiles.push({
              id: String(convo.conversationId || convo._id || convo.id),
              username: convo.groupName || 'Group Chat',
              avatar: convo.groupAvatar || DEFAULT_AVATAR,
              isGroup: true,
            });
            return;
          }
          const participants = convo.participants || [];
          const otherId = convo?.otherUserId || participants.find((id: any) => String(id) !== String(currentUserId));
          if (otherId && !seenIds.has(String(otherId))) {
            seenIds.add(String(otherId));
            const other = convo?.otherParticipant || convo?.otherUser || null;
            const resolvedName = other?.username || other?.displayName || other?.name || '';
            const resolvedAvatar = other?.avatar || other?.photoURL || '';

            profiles.push({
              id: String(otherId),
              username: resolvedName || `user_${String(otherId).slice(0, 6)}`,
              avatar: resolvedAvatar || DEFAULT_AVATAR,
            });

            if (!resolvedName) unresolvedIds.push(String(otherId));
          }
        });

        // Backfill missing profile names/avatars via user API
        if (unresolvedIds.length > 0) {
          const lookups = await Promise.allSettled(
            unresolvedIds.map(async (uid) => {
              const userRes = await apiService.get(`/users/${uid}`);
              if (!userRes?.success || !userRes?.data) return null;
              return {
                id: String(uid),
                username: userRes.data.username || userRes.data.displayName || userRes.data.name || `user_${String(uid).slice(0, 6)}`,
                avatar: userRes.data.avatar || userRes.data.photoURL || DEFAULT_AVATAR,
              };
            })
          );

          lookups.forEach((r) => {
            if (r.status !== 'fulfilled' || !r.value) return;
            const resolvedValue = r.value;
            const idx = profiles.findIndex((p) => String(p.id) === String(resolvedValue.id));
            if (idx >= 0) {
              profiles[idx] = {
                ...profiles[idx],
                username: resolvedValue.username || profiles[idx].username || 'User',
                avatar: resolvedValue.avatar || profiles[idx].avatar || DEFAULT_AVATAR,
              };
            }
          });
        }

        // If chat list is too short, suggest a few app users as fallback
        if (profiles.length < 5) {
          try {
            const qSeeds = ['a', 'e', 'i'];
            for (const q of qSeeds) {
              const searchRes = await apiService.get('/users/search', { q, requesterUserId: currentUserId, limit: 12 });
              const arr = Array.isArray(searchRes) ? searchRes : (searchRes?.data || []);
              for (const u of arr) {
                const id = String(u?._id || u?.id || '');
                if (!id || id === String(currentUserId) || seenIds.has(id)) continue;
                seenIds.add(id);
                profiles.push({
                  id,
                  username: u?.username || u?.displayName || u?.name || `user_${id.slice(0, 6)}`,
                  avatar: u?.avatar || u?.photoURL || DEFAULT_AVATAR,
                });
                if (profiles.length >= 8) break;
              }
              if (profiles.length >= 8) break;
            }
          } catch {}
        }

        setUsers(profiles);
      }
    } catch (err) {
      console.error('ShareModal fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (query.trim().length < 2) {
      if (query.trim().length === 0) fetchRecentChats();
      return;
    }
    setLoading(true);
    try {
      const res = await apiService.get('/users/search', { q: query.trim(), requesterUserId: currentUserId });
      const userList = Array.isArray(res) ? res : (res?.data || []);
      setUsers(userList.map((u: any) => ({
        id: u._id || u.id,
        username: u.username || u.displayName || u.name || `user_${String(u._id || u.id || '').slice(0, 6)}`,
        avatar: u.avatar || u.photoURL || DEFAULT_AVATAR,
      })));
    } catch (err) {
      console.error('ShareModal search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const renderUser = ({ item }: { item: any }) => {
    const isSelected = selectedUsers.includes(item.id);
    return (
      <TouchableOpacity 
        style={styles.userItem} 
        onPress={() => toggleUserSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrapper}>
          <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
          {isSelected && (
            <View style={styles.selectedOverlay}>
              <Ionicons name="checkmark-circle" size={24} color="#0095f6" />
            </View>
          )}
        </View>
        <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
        {item.isGroup && (
          <Text style={{ fontSize: 10, color: '#8e8e8e', marginTop: 2, textAlign: 'center' }}>Group</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (useViewOverlay) {
    if (!visible) return null;
    return (
      <View style={[StyleSheet.absoluteFillObject, { zIndex: 120 }]}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.container} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{title}</Text>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Feather name="search" size={16} color="#8e8e8e" />
                <TextInput 
                  style={styles.searchInput}
                  placeholder="Search"
                  placeholderTextColor="#8e8e8e"
                  value={search}
                  onChangeText={handleSearch}
                />
              </View>
              <TouchableOpacity
                style={styles.createGroupBtn}
                activeOpacity={0.8}
                onPress={() => {
                  onClose();
                  const shareType = String(sharePayload?.shareType || (sharePayload?.isStory ? 'story' : 'post')).trim();
                  const shareData = sharePayload?.data ?? sharePayload ?? null;
                  const params: any = {};
                  if (shareType) params.shareType = shareType;
                  if (shareData) {
                    try {
                      params.shareData = JSON.stringify(shareData);
                    } catch {
                      // ignore serialization failures and open plain create-group flow
                    }
                  }
                  router.push({ pathname: '/new-group', params } as any);
                }}
              >
                <Ionicons name="people-outline" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.usersListContainer}>
              {loading ? (
                <ActivityIndicator size="small" color="#0095f6" style={{ marginTop: 20 }} />
              ) : (
                <FlatList 
                  data={users}
                  keyExtractor={(item) => item.id}
                  renderItem={renderUser}
                  numColumns={3}
                  contentContainerStyle={[
                    styles.listContent,
                    modalVariant === 'home' && styles.listContentWithActions,
                  ]}
                  ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
                />
              )}
            </View>

            {(modalVariant === 'home' || selectedUsers.length > 0) && (
              <View style={styles.bottomContainer}>
                {modalVariant === 'home' && (
                  <View style={styles.quickActionsRow}>
                    <TouchableOpacity
                      style={styles.quickActionItem}
                      activeOpacity={0.8}
                      onPress={() => handleQuickAction('story')}
                    >
                      <View style={styles.quickActionIconCircle}>
                        <Ionicons name="add-circle-outline" size={24} color="#111827" />
                      </View>
                      <Text style={styles.quickActionLabel}>Add to story</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.quickActionItem}
                      activeOpacity={0.8}
                      onPress={() => handleQuickAction('whatsapp')}
                    >
                      <View style={[styles.quickActionIconCircle, styles.quickActionIconGreen]}>
                        <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                      </View>
                      <Text style={styles.quickActionLabel}>WhatsApp</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.quickActionItem}
                      activeOpacity={0.8}
                      onPress={() => handleQuickAction('copy_link')}
                    >
                      <View style={styles.quickActionIconCircle}>
                        <Ionicons name="link-outline" size={24} color="#111827" />
                      </View>
                      <Text style={styles.quickActionLabel}>Copy link</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.quickActionItem}
                      activeOpacity={0.8}
                      onPress={() => handleQuickAction('whatsapp_status')}
                    >
                      <View style={[styles.quickActionIconCircle, styles.quickActionIconGreen]}>
                        <Ionicons name="refresh-circle-outline" size={24} color="#fff" />
                      </View>
                      <Text style={styles.quickActionLabel}>WhatsApp Status</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.quickActionItem}
                      activeOpacity={0.8}
                      onPress={() => handleQuickAction('share')}
                    >
                      <View style={styles.quickActionIconCircle}>
                        <Ionicons name="share-social-outline" size={24} color="#111827" />
                      </View>
                      <Text style={styles.quickActionLabel}>Share</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedUsers.length > 0 && (
                  <TouchableOpacity 
                    style={[styles.sendBtn, sendingMessage && { backgroundColor: '#cccccc' }]} 
                    onPress={handleSendPress}
                    disabled={sendingMessage}
                  >
                    <Text style={styles.sendBtnText}>{sendingMessage ? 'Sending...' : 'Send'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.container} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color="#8e8e8e" />
              <TextInput 
                style={styles.searchInput}
                placeholder="Search"
                placeholderTextColor="#8e8e8e"
                value={search}
                onChangeText={handleSearch}
              />
            </View>
            <TouchableOpacity
              style={styles.createGroupBtn}
              activeOpacity={0.8}
              onPress={() => {
                onClose();
                const shareType = String(sharePayload?.shareType || (sharePayload?.isStory ? 'story' : 'post')).trim();
                const shareData = sharePayload?.data ?? sharePayload ?? null;
                const params: any = {};
                if (shareType) params.shareType = shareType;
                if (shareData) {
                  try {
                    params.shareData = JSON.stringify(shareData);
                  } catch {
                    // ignore serialization failures and open plain create-group flow
                  }
                }
                router.push({ pathname: '/new-group', params } as any);
              }}
            >
              <Ionicons name="people-outline" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.usersListContainer}>
            {loading ? (
              <ActivityIndicator size="small" color="#0095f6" style={{ marginTop: 20 }} />
            ) : (
              <FlatList 
                data={users}
                keyExtractor={(item) => item.id}
                renderItem={renderUser}
                numColumns={3}
                contentContainerStyle={[
                  styles.listContent,
                  modalVariant === 'home' && styles.listContentWithActions,
                ]}
                ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
              />
            )}
          </View>

          {(modalVariant === 'home' || selectedUsers.length > 0) && (
            <View style={styles.bottomContainer}>
              {modalVariant === 'home' && (
                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={styles.quickActionItem}
                    activeOpacity={0.8}
                    onPress={() => handleQuickAction('story')}
                  >
                    <View style={styles.quickActionIconCircle}>
                      <Ionicons name="add-circle-outline" size={24} color="#111827" />
                    </View>
                    <Text style={styles.quickActionLabel}>Add to story</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionItem}
                    activeOpacity={0.8}
                    onPress={() => handleQuickAction('whatsapp')}
                  >
                    <View style={[styles.quickActionIconCircle, styles.quickActionIconGreen]}>
                      <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                    </View>
                    <Text style={styles.quickActionLabel}>WhatsApp</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionItem}
                    activeOpacity={0.8}
                    onPress={() => handleQuickAction('copy_link')}
                  >
                    <View style={styles.quickActionIconCircle}>
                      <Ionicons name="link-outline" size={24} color="#111827" />
                    </View>
                    <Text style={styles.quickActionLabel}>Copy link</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionItem}
                    activeOpacity={0.8}
                    onPress={() => handleQuickAction('whatsapp_status')}
                  >
                    <View style={[styles.quickActionIconCircle, styles.quickActionIconGreen]}>
                      <Ionicons name="refresh-circle-outline" size={24} color="#fff" />
                    </View>
                    <Text style={styles.quickActionLabel}>WhatsApp Status</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickActionItem}
                    activeOpacity={0.8}
                    onPress={() => handleQuickAction('share')}
                  >
                    <View style={styles.quickActionIconCircle}>
                      <Ionicons name="share-social-outline" size={24} color="#111827" />
                    </View>
                    <Text style={styles.quickActionLabel}>Share</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedUsers.length > 0 && (
                <TouchableOpacity 
                  style={[styles.sendBtn, sendingMessage && { backgroundColor: '#cccccc' }]} 
                  onPress={handleSendPress}
                  disabled={sendingMessage}
                >
                  <Text style={styles.sendBtnText}>{sendingMessage ? 'Sending...' : 'Send'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '80%',
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#dbdbdb',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#efefef',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#000',
  },
  createGroupBtn: {
    marginLeft: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usersListContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  listContentWithActions: {
    paddingBottom: 20,
  },
  userItem: {
    width: SCREEN_WIDTH / 3 - 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
  },
  userAvatar: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: '#eee',
  },
  selectedOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  username: {
    marginTop: 8,
    fontSize: 12,
    color: '#262626',
    textAlign: 'center',
    width: '90%',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#8e8e8e',
  },
  bottomContainer: {
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  sendBtn: {
    backgroundColor: '#FF8D00',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  quickActionItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickActionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickActionIconGreen: {
    backgroundColor: '#22c55e',
  },
  quickActionLabel: {
    fontSize: 11,
    color: '#262626',
    textAlign: 'center',
    paddingHorizontal: 2,
    lineHeight: 13,
  },
});
