import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/_services/apiService';
import { DEFAULT_AVATAR_URL } from '@/lib/api';


interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string | null;
  onGroupCreated: () => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  visible,
  onClose,
  userId,
  onGroupCreated,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<any[]>([]);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<any[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await apiService.get('/follow/discover', { limit: 10 });
      if (res?.success && Array.isArray(res.data)) {
        setGroupSearchResults(res.data);
      }
    } catch (e) {
      console.warn('[CreateGroupModal] Failed to fetch suggestions:', e);
    }
  }, []);

  const searchUsersForGroup = useCallback(
    async (query: string) => {
      if (!query || query.trim().length < 2) {
        fetchSuggestions();
        return;
      }
      try {
        const res = await apiService.get('/users/search', { q: query.trim(), requesterUserId: userId, limit: 30 });
        const users = Array.isArray(res?.data) ? res.data : [];
        setGroupSearchResults(users);
      } catch {
        setGroupSearchResults([]);
      }
    },
    [userId, fetchSuggestions]
  );

  useEffect(() => {
    if (visible && !groupSearch) {
      fetchSuggestions();
    }
  }, [visible, groupSearch, fetchSuggestions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsersForGroup(groupSearch);
    }, 220);
    return () => clearTimeout(timer);
  }, [groupSearch, searchUsersForGroup]);

  const toggleGroupMember = useCallback((u: any) => {
    const id = String(u?._id || u?.id || u?.firebaseUid || u?.uid || '');
    if (!id) return;

    setSelectedGroupMembers((prev) => {
      const exists = prev.some((m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || '') === id);
      if (exists) return prev.filter((m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || '') !== id);
      return [...prev, u];
    });
  }, []);

  const resetCreateGroup = useCallback(() => {
    setGroupName('');
    setGroupSearch('');
    setGroupSearchResults([]);
    setSelectedGroupMembers([]);
    setGroupSaving(false);
  }, []);

  const handleCreateGroup = useCallback(async () => {
    if (!userId || groupSaving) return;
    
    const memberIds = selectedGroupMembers
      .map((m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || ''))
      .filter(Boolean);

    if (memberIds.length === 0) return;

    // SINGLE CHAT FLOW
    if (memberIds.length === 1) {
      const targetUser = selectedGroupMembers[0];
      const targetId = memberIds[0];
      const targetName = targetUser?.displayName || targetUser?.username || targetUser?.name || 'User';
      const targetAvatar = targetUser?.avatar || targetUser?.photoURL || '';

      onClose();
      resetCreateGroup();

      router.push({
        pathname: '/dm',
        params: {
          otherUserId: targetId,
          user: targetName,
          avatar: targetAvatar,
          isGroup: '0'
        },
      });
      return;
    }

    // GROUP CHAT FLOW
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      alert('Please enter a group name');
      return;
    }

    setGroupSaving(true);
    try {
      const result: any = await apiService.post('/conversations/group', {
        name: trimmedName,
        memberIds,
      });
      const createdConversationId = String(result?.conversationId || result?.data?.conversationId || result?.data?._id || '');
      if (!result?.success || !createdConversationId) {
        throw new Error(result?.error || 'Failed to create group');
      }

      onClose();
      resetCreateGroup();
      onGroupCreated();

      router.push({
        pathname: '/dm',
        params: {
          conversationId: createdConversationId,
          isGroup: '1',
          groupName: trimmedName,
          user: trimmedName,
        },
      });
    } catch (error: any) {
      console.error('[Inbox] create group failed:', error?.message || error);
      alert('Failed to create group. Please try again.');
    } finally {
      setGroupSaving(false);
    }
  }, [groupName, groupSaving, onGroupCreated, resetCreateGroup, router, selectedGroupMembers, userId, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.groupSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
          <Pressable style={[styles.groupSheet, { paddingBottom: Math.max(insets.bottom, 20) }]} onPress={() => {}}>
            <View style={styles.groupHandle} />
            <Text style={styles.groupTitle}>{selectedGroupMembers.length > 1 ? 'New Group' : 'New Message'}</Text>
            
            {selectedGroupMembers.length > 1 && (
              <TextInput
                style={styles.groupNameInput}
                placeholder="Group name (Required)"
                placeholderTextColor="#9ca3af"
                value={groupName}
                onChangeText={setGroupName}
                maxLength={60}
              />
            )}

            <TextInput
              style={styles.groupSearchInput}
              placeholder="Search people..."
              placeholderTextColor="#9ca3af"
              value={groupSearch}
              onChangeText={setGroupSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <View style={styles.memberChipsWrap}>
              {selectedGroupMembers.map((m: any) => {
                const id = String(m?._id || m?.id || m?.firebaseUid || m?.uid || '');
                const label = m?.displayName || m?.username || m?.name || 'User';
                return (
                  <TouchableOpacity key={`chip_${id}`} style={styles.memberChip} onPress={() => toggleGroupMember(m)}>
                    <Text style={styles.memberChipText} numberOfLines={1}>
                      {label}
                    </Text>
                    <Feather name="x" size={14} color="#1f2937" />
                  </TouchableOpacity>
                );
              })}
            </View>

            <FlashList
              data={groupSearchResults}
              keyExtractor={(u: any, index: number) => {
                const id = String(u?._id || u?.id || u?.firebaseUid || u?.uid || '');
                return id ? `user_${id}` : `user_idx_${index}`;
              }}
              style={{ maxHeight: 230, flexGrow: 0 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item: u }: { item: any }) => {
                const id = String(u?._id || u?.id || u?.firebaseUid || u?.uid || '');
                const selected = selectedGroupMembers.some(
                  (m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || '') === id
                );
                const name = u?.displayName || u?.username || u?.name || 'User';
                const avatar = u?.avatar || u?.photoURL || DEFAULT_AVATAR_URL;
                const isDefaultAvatar = !avatar || avatar === DEFAULT_AVATAR_URL || avatar.includes('avatardefault.webp');
                return (
                  <TouchableOpacity style={styles.memberRow} onPress={() => toggleGroupMember(u)} activeOpacity={0.8}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, overflow: 'hidden', marginRight: 10 }}>
                      {isDefaultAvatar ? (
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#788d9a', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                            {String(name || 'U').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      ) : (
                        <ExpoImage 
                          source={{ uri: avatar }} 
                          style={[styles.memberAvatar, { marginRight: 0 }]} 
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={150}
                        />
                      )}
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Feather
                      name={selected ? 'check-circle' : 'circle'}
                      size={18}
                      color={selected ? '#0095f6' : '#9ca3af'}
                    />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                groupSearch.trim().length >= 2 ? (
                  <Text style={styles.memberEmpty}>No users found</Text>
                ) : (
                  <Text style={styles.memberEmpty}>Suggested for you</Text>
                )
              }
            />

            <TouchableOpacity
              style={[
                styles.createGroupBtn,
                (selectedGroupMembers.length === 0 || (selectedGroupMembers.length > 1 && !groupName.trim()) || groupSaving) && { opacity: 0.5 },
              ]}
              onPress={handleCreateGroup}
              disabled={selectedGroupMembers.length === 0 || (selectedGroupMembers.length > 1 && !groupName.trim()) || groupSaving}
              activeOpacity={0.85}
            >
              <Text style={styles.createGroupBtnText}>
                {groupSaving 
                  ? 'Creating...' 
                  : selectedGroupMembers.length > 1 
                    ? 'Create Group' 
                    : selectedGroupMembers.length === 1 
                      ? `Chat with ${selectedGroupMembers[0].displayName || selectedGroupMembers[0].username || 'User'}`
                      : 'Select a User'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  groupSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  groupSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  groupHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  groupNameInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  groupSearchInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  memberChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '70%',
  },
  memberChipText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '400',
    maxWidth: 170,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
    backgroundColor: 'transparent',
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '400',
  },
  memberEmpty: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    paddingVertical: 18,
  },
  createGroupBtn: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#0095f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  createGroupBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
