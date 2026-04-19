import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StoriesViewer from '@/src/_components/StoriesViewer';
import { getHighlightStories } from '../../lib/firebaseHelpers/core';
import { getCachedHighlightStories, storyForStoriesViewer } from '../../lib/storyViewer';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function HighlightScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const id = (params.id as string) || 'unknown';

  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<any[]>([]);
  const [viewerVisible, setViewerVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getHighlightStories(id);
        let list = Array.isArray(res?.stories) ? res.stories : [];
        if (list.length === 0) {
          const cached = await getCachedHighlightStories(id);
          if (Array.isArray(cached) && cached.length > 0) list = cached;
        }
        if (!mounted) return;
        setStories(list);
        setViewerVisible(Array.isArray(list) && list.length > 0);
      } catch {
        if (mounted) setStories([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const viewerStories = useMemo(() => {
    return (Array.isArray(stories) ? stories : []).map((s: any, i: number) => storyForStoriesViewer(s, i));
  }, [stories]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Highlight</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Loading highlight...</Text>
        </View>
      ) : viewerStories.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No stories in this highlight.</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <TouchableOpacity style={styles.openBtn} onPress={() => setViewerVisible(true)} activeOpacity={0.85}>
            <Text style={styles.openBtnText}>Open Highlight</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={viewerVisible} transparent={false} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <StoriesViewer
          stories={viewerStories}
          initialIndex={0}
          onClose={() => {
            setViewerVisible(false);
            safeRouterBack();
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800', fontSize: 18, marginLeft: 6, color: '#111', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loadingText: { marginTop: 10, color: '#777' },
  empty: { color: '#777', fontSize: 15, textAlign: 'center' },
  openBtn: { backgroundColor: '#111', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  openBtnText: { color: '#fff', fontWeight: '800' },
});
