import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/src/_components/UserContext';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { safeRouterBack } from '@/lib/safeRouterBack';


export default function Archive() {
  const router = useRouter();
  const user = useUser();
  const [uid, setUid] = useState<string | null>(null);
  const [archived, setArchived] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArchived = useCallback(async (activeUid: string) => {
    setLoading(true);
    try {
      const mod: { getArchivedConversations: (id: string) => Promise<{ success: boolean; data?: any[] }> } = await import('../lib/firebaseHelpers/archive');
      const result = await mod.getArchivedConversations(activeUid);
      if (result?.success) {
        const raw = Array.isArray(result.data) ? result.data : [];

        const getSortTime = (c: any) => {
          const t = c?.updatedAt || c?.lastMessageAt || c?.lastMessageTime || c?.createdAt;
          const d = t?.toDate ? t.toDate() : (t ? new Date(t) : null);
          return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
        };

        const resolveOtherUserId = (c: any) => {
          const otherFromObj = c?.otherUser?.id;
          if (typeof otherFromObj === 'string' && otherFromObj.trim() !== '') return otherFromObj;
          const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
          const otherFromParticipants = participants.find((p: string) => p !== String(activeUid));
          return typeof otherFromParticipants === 'string' ? otherFromParticipants : null;
        };

        const map = new Map<string, any>();
        for (const c of raw) {
          const otherId = resolveOtherUserId(c);
          const key = otherId || String(c?.conversationId || c?.id || c?._id);
          const existing = map.get(key);
          if (!existing) {
            map.set(key, c);
          } else {
            const keep = getSortTime(c) >= getSortTime(existing) ? c : existing;
            map.set(key, keep);
          }
        }

        const deduped = Array.from(map.values()).sort((a, b) => getSortTime(b) - getSortTime(a));
        setArchived(deduped);
      } else {
        setArchived([]);
      }
    } catch {
      setArchived([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const contextUid = (user as any)?.uid;
      if (typeof contextUid === 'string' && contextUid.trim() !== '') {
        if (isMounted) setUid(contextUid);
        return;
      }

      try {
        const stored = await AsyncStorage.getItem('userId');
        if (isMounted) setUid(typeof stored === 'string' && stored.trim() !== '' ? stored : null);
      } catch {
        if (isMounted) setUid(null);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setArchived([]);
      return;
    }

    fetchArchived(uid);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      fetchArchived(uid);
    }, [fetchArchived, uid])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', backgroundColor: '#fff' }}>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            safeRouterBack();
          }}
          style={{ padding: 6 }}
        >
          <Feather name="x" size={22} color="#FF8800" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: '#111', marginLeft: -22 }}>Archive Chats</Text>
        <View style={{ width: 28 }} />
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FF8800" />
        </View>
      ) : !uid ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: '#999', fontSize: 16, textAlign: 'center' }}>Please sign in to view archived chats</Text>
        </View>
      ) : archived.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: '#999', fontSize: 16, textAlign: 'center' }}>No archived chats yet</Text>
        </View>
      ) : (
        <FlatList
          data={archived}
          keyExtractor={(t) => t?.otherUser?.id || t?.conversationId || t?.id}
          style={{ width: '100%' }}
          renderItem={({ item }) => (
            <Swipeable
              renderRightActions={() => (
                <TouchableOpacity
                  style={{ backgroundColor: '#FF8800', justifyContent: 'center', alignItems: 'center', width: 100, height: '100%', borderRadius: 12 }}
                  onPress={async () => {
                    hapticMedium();
                    if (!uid) return;
                    // @ts-ignore
                    const mod: { unarchiveConversation: (id: string, uid: string) => Promise<any> } = await import('../lib/firebaseHelpers/archive');
                    await mod.unarchiveConversation(item.id, uid);
                    setArchived((prev) => prev.filter(c => c.id !== item.id));
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Unarchive</Text>
                </TouchableOpacity>
              )}
            >
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                onPress={() => {
                  hapticLight();
                  const otherId = typeof item?.otherUser?.id === 'string'
                    ? item.otherUser.id
                    : (Array.isArray(item?.participants)
                      ? item.participants.map(String).find((p: string) => p !== String(uid))
                      : null);

                  const name = item?.otherUser?.displayName || item?.otherUser?.name;
                  const convoId = item?.conversationId || item?.id || item?._id;

                  if (otherId) {
                    router.push({
                      pathname: '/dm',
                      params: {
                        otherUserId: otherId,
                        conversationId: convoId,
                        user: name
                      }
                    });
                    return;
                  }

                  router.push({ pathname: '/dm', params: { conversationId: convoId, user: name } });
                }}
              >
                <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Image source={{ uri: (item.otherUser && item.otherUser.avatar) ? item.otherUser.avatar : DEFAULT_AVATAR_URL }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#222' }}>{item.otherUser && (item.otherUser.displayName || item.otherUser.name) ? (item.otherUser.displayName || item.otherUser.name) : 'Unknown User'}</Text>
                  <Text style={{ fontSize: 14, color: '#666' }} numberOfLines={1}>{item.lastMessage}</Text>
                </View>
              </TouchableOpacity>
            </Swipeable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  backBtn: {
    padding: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#000',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarRingUnread: {
    borderWidth: 2,
    borderColor: '#0A3D62',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eee',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  lastMsg: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  time: {
    fontSize: 12,
    color: '#aaa',
    marginLeft: 8,
  },
  unarchiveBtn: {
    backgroundColor: '#007aff',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
    borderRadius: 12,
  },
  unarchiveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

