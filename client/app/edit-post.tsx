import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '@/src/_services/apiService';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { getCachedData, setCachedData } from '../hooks/useOffline';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { DEFAULT_CATEGORIES, getCategories } from '@/lib/firebaseHelpers';

type CategoryOption = { name: string; image: string };

const normalizeCategories = (raw: any): CategoryOption[] => {
  const candidates = [raw, raw?.data, raw?.categories, raw?.data?.categories, raw?.data?.data, raw?.payload?.categories];
  const arr = candidates.find((entry) => Array.isArray(entry));
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c: any) => {
      if (typeof c === 'string') return { name: c, image: '' };
      return { name: typeof c?.name === 'string' ? c.name : '', image: typeof c?.image === 'string' ? c.image : '' };
    })
    .filter((c: CategoryOption) => c.name.trim().length > 0);
};

const defaultCategories = normalizeCategories(DEFAULT_CATEGORIES);

export default function EditPostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const postId = useMemo(() => String((params as any)?.postId || ''), [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caption, setCaption] = useState('');
  const [content, setContent] = useState('');
  const [username, setUsername] = useState<string>('You');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<CategoryOption[]>(defaultCategories);
  const [postAuthorId, setPostAuthorId] = useState('');

  const load = useCallback(async () => {
    if (!postId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rawName = (await AsyncStorage.getItem('userName')) || (await AsyncStorage.getItem('displayName')) || '';
      const fallbackName = rawName ? String(rawName) : 'You';
      setUsername(fallbackName);

      const res = await apiService.get(`/posts/${postId}`);
      const data = (res && typeof res === 'object' && (res as any).data) ? (res as any).data : null;
      const post = data && typeof data === 'object' && (data as any).data ? (data as any).data : data;
      setCaption(typeof post?.caption === 'string' ? post.caption : '');
      setContent(typeof post?.content === 'string' ? post.content : '');
      const authorId =
        typeof post?.userId === 'string'
          ? post.userId
          : String(post?.userId?._id || post?.userId?.id || post?.userId?.uid || post?.userId?.firebaseUid || '');
      setPostAuthorId(authorId);
      const cat = typeof post?.category === 'string' ? post.category : String(post?.category?.name || '');
      setCategory(cat);

      const media: string[] = [];
      if (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0) {
        media.push(...post.mediaUrls.filter(Boolean));
      } else if (Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
        media.push(...post.imageUrls.filter(Boolean));
      } else if (post.imageUrl) {
        media.push(post.imageUrl);
      }
      if (post.videoUrl) media.push(post.videoUrl);
      if (Array.isArray(post.videoUrls)) media.push(...post.videoUrls.filter(Boolean));
      setMediaUrls([...new Set(media)]);
      setMediaType((post.videoUrl || (Array.isArray(post.videoUrls) && post.videoUrls.length > 0)) ? 'video' : 'image');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load post');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cats = normalizeCategories(await getCategories());
        if (!cancelled) setCategories(cats.length > 0 ? cats : defaultCategories);
      } catch {
        if (!cancelled) setCategories(defaultCategories);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = useCallback(async () => {
    if (!postId) return;
    if (saving) return;
    setSaving(true);
    try {
      const currentUserId =
        postAuthorId ||
        (await AsyncStorage.getItem('userId')) ||
        (await AsyncStorage.getItem('uid')) ||
        (await AsyncStorage.getItem('firebaseUid')) ||
        '';
      if (!currentUserId) throw new Error('Missing userId');
      // Keep backend + feed consistent: most of the app renders from `caption`,
      // but the backend requires `content`. Treat them as the same user-facing value.
      const unified = String(caption || '').trim();
      const res = await apiService.patch(`/posts/${postId}`, {
        currentUserId,
        userId: currentUserId,
        caption: unified,
        content: unified,
        text: unified,
        category: category || '',
        categoryName: category || '',
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to update post');

      // Patch cached feeds so UI updates even if the list is currently rendered from cache.
      const patchCachedList = async (cacheKey: string, idsToMatch: string[], fullPatch?: any) => {
        try {
          const cached = await getCachedData<any[]>(cacheKey);
          if (!Array.isArray(cached) || cached.length === 0) return;
          const next = cached.map((p) => {
            const ids = [String(p?.id || ''), String(p?._id || ''), String((p as any)?.postId || '')].filter(Boolean);
            if (!idsToMatch.some((id) => ids.includes(id))) return p;
            return {
              ...p,
              ...(fullPatch && typeof fullPatch === 'object' ? fullPatch : null),
              caption: unified,
              content: unified,
              text: unified,
              category: category || '',
              updatedAt: new Date().toISOString(),
            };
          });
          await setCachedData(cacheKey, next, { ttl: 24 * 60 * 60 * 1000 });
        } catch { }
      };

      // Emit update for both id forms (some lists store `id`, others store `_id`)
      try {
        const payload = (res && typeof res === 'object' && (res as any).data) ? (res as any).data : null;
        const updatedPost = payload && typeof payload === 'object' && (payload as any).data ? (payload as any).data : payload;
        const idA = String(updatedPost?._id || '');
        const idB = String(updatedPost?.id || '');
        const ids = Array.from(new Set([String(postId || ''), idA, idB].filter(Boolean)));

        // Fetch the latest post snapshot (enriched) so UI doesn't depend on stale cached objects.
        let freshPost: any = null;
        try {
          const freshRes = await apiService.get(`/posts/${encodeURIComponent(ids[0] || postId)}`);
          const freshData = (freshRes && typeof freshRes === 'object' && (freshRes as any).data) ? (freshRes as any).data : null;
          freshPost = freshData && typeof freshData === 'object' && (freshData as any).data ? (freshData as any).data : freshData;
        } catch { }

        // Home cache key uses canonical currentUserId
        await patchCachedList(`home_feed_v1_${String(currentUserId || 'anon')}`, ids, freshPost);
        // Own profile cache key (viewedUserId===currentUserId when editing own post)
        await (async () => {
          const key = `profile_v2_${String(currentUserId || 'unknown')}_${String(currentUserId || 'anon')}`;
          try {
            const cached = await getCachedData<any>(key);
            if (!cached || typeof cached !== 'object') return;
            const cachedPosts = Array.isArray((cached as any).posts) ? (cached as any).posts : null;
            if (!cachedPosts) return;
            const nextPosts = cachedPosts.map((p: any) => {
              const pids = [String(p?.id || ''), String(p?._id || ''), String(p?.postId || '')].filter(Boolean);
              if (!ids.some((id) => pids.includes(id))) return p;
              return {
                ...p,
                ...(freshPost && typeof freshPost === 'object' ? freshPost : null),
                caption: unified,
                content: unified,
                text: unified,
                category: category || '',
                updatedAt: new Date().toISOString(),
              };
            });
            await setCachedData(key, { ...(cached as any), posts: nextPosts }, { ttl: 24 * 60 * 60 * 1000 });
          } catch { }
        })();

        ids.forEach((id) => feedEventEmitter.emitPostUpdated(id, freshPost || { caption: unified, content: unified, text: unified, category: category || '' }));
        // Some screens listen to this for a full refetch (profile/saved).
        // @ts-ignore
        feedEventEmitter.emit('feedUpdated');
      } catch {
        feedEventEmitter.emitPostUpdated(postId, { caption: unified, content: unified, category: category || '' });
      }
      safeRouterBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update post');
    } finally {
      setSaving(false);
    }
  }, [caption, category, postAuthorId, postId, router, saving]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeRouterBack()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit</Text>
        <TouchableOpacity onPress={onSave} style={styles.headerBtn} disabled={saving}>
          <Text style={[styles.doneText, saving && { opacity: 0.6 }]}>Done</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.avatarStub}>
              <Text style={styles.avatarText}>{String(username || 'Y').trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.username}>{username || 'You'}</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Write a caption…"
                placeholderTextColor="#8e8e8e"
                style={styles.captionInput}
                multiline
              />
            </View>
            {mediaUrls.length > 0 && (
              <View style={styles.mediaPreviewContainer}>
                {mediaType === 'video' ? (
                  <Video
                    source={{ uri: mediaUrls[0] }}
                    style={styles.mediaPreview}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isMuted
                    isLooping
                  />
                ) : (
                  <Image source={{ uri: mediaUrls[0] }} style={styles.mediaPreview} />
                )}
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {(categories.length > 0 ? categories : defaultCategories).map((cat) => {
              const selected = category === cat.name;
              return (
                <TouchableOpacity
                  key={cat.name}
                  onPress={() => setCategory(selected ? '' : cat.name)}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                >
                  <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Keep compatibility with backend `content` field; hidden from UI but still editable if needed */}
          <Text style={styles.hiddenLabel}>Advanced</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Content…"
            placeholderTextColor="#b0b0b0"
            style={styles.hiddenInput}
            multiline
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#efefef',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#262626' },
  headerBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  headerBtnText: { color: '#262626', fontSize: 16, fontWeight: '400' },
  doneText: { color: '#0095f6', fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  mediaPreviewContainer: {
    width: 48,
    height: 48,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#efefef',
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
  },
  avatarStub: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#262626' },
  username: { fontSize: 14, fontWeight: '700', color: '#262626', marginBottom: 6 },
  sectionLabel: { marginTop: 18, marginBottom: 10, fontSize: 13, color: '#262626', fontWeight: '700' },
  categoryRow: { gap: 8, paddingRight: 16 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#f2f2f2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  categoryChipSelected: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  categoryChipText: { color: '#262626', fontSize: 13, fontWeight: '600' },
  categoryChipTextSelected: { color: '#fff' },
  captionInput: {
    minHeight: 110,
    fontSize: 16,
    color: '#262626',
    lineHeight: 22,
    padding: 0,
    textAlignVertical: 'top',
  },
  hiddenLabel: { marginTop: 16, fontSize: 12, color: '#8e8e8e', fontWeight: '600' },
  hiddenInput: {
    marginTop: 6,
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#555',
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
});

