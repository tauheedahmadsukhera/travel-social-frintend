import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '@/src/_services/apiService';
import { createGroupConversation } from '@/lib/firebaseHelpers/conversation';
import { DEFAULT_AVATAR_URL } from '@/lib/api';


const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

type UserItem = {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
};

export default function NewGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [groupName, setGroupName] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('userId').then((uid) => {
      setCurrentUserId(uid || '');
    });
  }, []);

  const loadSuggestedUsers = useCallback(async (uid: string) => {
    if (!uid) return;
    setLoading(true);
    try {
      const seen = new Set<string>();
      const users: UserItem[] = [];

      const convRes: any = await apiService.get(`/conversations?userId=${uid}`);
      const convos = Array.isArray(convRes?.data) ? convRes.data : [];

      for (const convo of convos) {
        if (convo?.isGroup) continue;
        const participants = Array.isArray(convo?.participants) ? convo.participants.map(String) : [];
        const otherId = String(convo?.otherUserId || participants.find((p: string) => p !== String(uid)) || '');
        if (!otherId || otherId === String(uid) || seen.has(otherId)) continue;
        seen.add(otherId);

        const other = convo?.otherParticipant || convo?.otherUser || null;
        const displayName = String(other?.displayName || other?.name || other?.username || '').trim();
        const username = String(other?.username || '').trim();
        users.push({
          id: otherId,
          displayName: displayName || username || `user_${otherId.slice(0, 6)}`,
          username: username || displayName || '',
          avatar: String(other?.avatar || other?.photoURL || DEFAULT_AVATAR),
        });
      }

      if (users.length < 10) {
        const seeds = ['a', 'e', 'i'];
        for (const q of seeds) {
          const res: any = await apiService.get('/users/search', { q, requesterUserId: uid, limit: 20 });
          const arr = Array.isArray(res?.data) ? res.data : [];
          for (const u of arr) {
            const id = String(u?._id || u?.id || '');
            if (!id || id === String(uid) || seen.has(id)) continue;
            seen.add(id);
            users.push({
              id,
              displayName: String(u?.displayName || u?.name || u?.username || `user_${id.slice(0, 6)}`),
              username: String(u?.username || u?.displayName || ''),
              avatar: String(u?.avatar || u?.photoURL || DEFAULT_AVATAR),
            });
            if (users.length >= 30) break;
          }
          if (users.length >= 30) break;
        }
      }

      setAllUsers(users);
    } catch (e) {
      setAllUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    loadSuggestedUsers(currentUserId);
  }, [currentUserId, loadSuggestedUsers]);

  useEffect(() => {
    if (!currentUserId) return;
    const q = search.trim();
    if (q.length < 2) return;

    const timer = setTimeout(async () => {
      try {
        const res: any = await apiService.get('/users/search', { q, requesterUserId: currentUserId, limit: 30 });
        const arr = Array.isArray(res?.data) ? res.data : [];
        const mapped: UserItem[] = arr
          .map((u: any) => {
            const id = String(u?._id || u?.id || '');
            if (!id) return null;
            return {
              id,
              displayName: String(u?.displayName || u?.name || u?.username || `user_${id.slice(0, 6)}`),
              username: String(u?.username || u?.displayName || ''),
              avatar: String(u?.avatar || u?.photoURL || DEFAULT_AVATAR),
            };
          })
          .filter(Boolean) as UserItem[];

        const selectedMap = new Map(selectedUsers.map((u) => [u.id, u]));
        const deduped = Array.from(new Map([...mapped, ...selectedMap.values()].map((u) => [u.id, u])).values());
        setAllUsers(deduped);
      } catch {
        // keep previous list
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [search, currentUserId, selectedUsers]);

  const selectedSet = useMemo(() => new Set(selectedUsers.map((u) => u.id)), [selectedUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) => {
      return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
  }, [allUsers, search]);

  const toggleUser = useCallback((user: UserItem) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      if (exists) return prev.filter((u) => u.id !== user.id);
      return [...prev, user];
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!currentUserId || creating || selectedUsers.length < 2) return;
    setCreating(true);
    try {
      const memberIds = selectedUsers.map((u) => u.id);
      const result = await createGroupConversation(groupName.trim() || 'New group', memberIds);
      if (!result?.success || !result.conversationId) {
        setCreating(false);
        return;
      }

      const shareType = typeof params?.shareType === 'string' ? params.shareType : '';
      const rawShareData = typeof params?.shareData === 'string' ? params.shareData : '';
      if (shareType && rawShareData) {
        try {
          const parsed = JSON.parse(rawShareData);
          if (shareType === 'story') {
            const { sendStoryMessage } = await import('../lib/firebaseHelpers/messages');
            await sendStoryMessage(String(result.conversationId), currentUserId, parsed, {});
          } else {
            const { sendPostMessage } = await import('../lib/firebaseHelpers/messages');
            await sendPostMessage(String(result.conversationId), currentUserId, parsed, {});
          }
        } catch {
          // group is created regardless; ignore share serialization/send errors
        }
      }

      router.replace({
        pathname: '/dm',
        params: {
          conversationId: String(result.conversationId),
          isGroup: '1',
          groupName: groupName.trim() || 'New group',
          user: groupName.trim() || 'New group',
        },
      } as any);
    } catch {
      setCreating(false);
    }
  }, [creating, currentUserId, groupName, params?.shareData, params?.shareType, router, selectedUsers]);

  const renderUser = ({ item }: { item: UserItem }) => {
    const checked = selectedSet.has(item.id);
    return (
      <TouchableOpacity style={styles.userRow} activeOpacity={0.85} onPress={() => toggleUser(item)}>
        <Image source={{ uri: item.avatar || DEFAULT_AVATAR }} style={[styles.userAvatar, checked && styles.userAvatarSelected]} />
        <View style={styles.userTextWrap}>
          <Text style={styles.userName} numberOfLines={1}>{item.displayName}</Text>
          {!!item.username && <Text style={styles.userUsername} numberOfLines={1}>{item.username}</Text>}
        </View>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => safeRouterBack()}>
            <Feather name="arrow-left" size={30} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New group</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.content}>
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Name group (optional)"
            placeholderTextColor="#7b7b7b"
            style={styles.groupNameInput}
            maxLength={60}
          />

          <View style={styles.searchWrap}>
            <Feather name="search" size={34} color="#a3a3a3" style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor="#8e8e8e"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {selectedUsers.length > 0 && (
            <View style={styles.selectedRow}>
              {selectedUsers.map((u) => (
                <View key={`sel_${u.id}`} style={styles.selectedItem}>
                  <Image source={{ uri: u.avatar || DEFAULT_AVATAR }} style={styles.selectedAvatar} />
                  <TouchableOpacity style={styles.selectedClose} onPress={() => toggleUser(u)}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text numberOfLines={1} style={styles.selectedName}>{u.displayName}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.suggestedTitle}>Suggested</Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} size="small" color="#4f60f2" />
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              renderItem={renderUser}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 130 }}
            />
          )}
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.sendBtn, (selectedUsers.length < 2 || creating) && styles.sendBtnDisabled]}
            disabled={selectedUsers.length < 2 || creating}
            onPress={handleCreate}
            activeOpacity={0.85}
          >
            <Text style={styles.sendBtnText}>{creating ? 'Creating...' : 'Send to group'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#111',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  groupNameInput: {
    fontSize: 17,
    fontWeight: '400',
    color: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#c8c8c8',
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f2f7',
    borderRadius: 16,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '400',
    color: '#111',
    paddingVertical: 10,
  },
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 10,
  },
  selectedItem: {
    width: 88,
    alignItems: 'center',
  },
  selectedAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#efefef',
  },
  selectedClose: {
    position: 'absolute',
    top: -6,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#23262b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  selectedName: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '400',
    color: '#111',
    maxWidth: 86,
  },
  suggestedTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111',
    marginVertical: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  userAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ececec',
    marginRight: 12,
  },
  userAvatarSelected: {
    opacity: 0.35,
  },
  userTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 17,
    fontWeight: '400',
    color: '#111',
  },
  userUsername: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '400',
    color: '#6f6f6f',
  },
  checkbox: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#7a828a',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
    borderTopWidth: 1,
    borderTopColor: '#efefef',
    backgroundColor: '#fff',
  },
  sendBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4f60f2',
  },
  sendBtnDisabled: {
    opacity: 0.65,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
