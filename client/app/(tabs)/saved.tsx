/**
 * saved.tsx
 * "All Collection" screen — matches design screenshots exactly:
 *  • Top bar: title (left) + "Collections ▾" button (right)
 *  • All saved posts grid
 *  • "Collections ▾" → bottom sheet with: All, collections list (⊗ delete, ✏️ edit)
 *  • Select collection → title changes, grid filters
 *  • Edit → inline edit bottom sheet (name, visibility, invite)
 *  • Delete → CollectionDeleteModal
 */
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CollectionDeleteModal from '@/src/_components/CollectionDeleteModal';
import SaveToCollectionModal from '@/src/_components/SaveToCollectionModal';
import PostViewerModal from '@/src/_components/PostViewerModal';
import CommentSection from '@/src/_components/CommentSection';
import { apiService } from '@/src/_services/apiService';
import { feedEventEmitter } from '../../lib/feedEventEmitter';
import { sharePost } from '../../lib/postShare';
import { useHeaderHeight } from './_layout';
import { resolveCanonicalUserId } from '../../lib/currentUser';
import { hapticLight } from '../../lib/haptics';
import { getCachedData, setCachedData, useOfflineBanner, useNetworkStatus } from '../../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Collection {
  _id: string;
  name: string;
  coverImage?: string;
  postIds: string[];
  visibility?: 'public' | 'private' | 'specific';
  collaborators?: any[];
  allowedUsers?: string[];
  allowedGroups?: string[];
  userId: string;
}

interface SavedPost {
  id: string;
  imageUrl: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SavedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const targetUserId = typeof params.userId === 'string' ? params.userId : null;
  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Removed redundant useEffect, now handled by useFocusEffect below

  // Data
  const [collections, setCollections] = useState<Collection[]>([]);
  const [allSavedPosts, setAllSavedPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const justCreatedCollectionRef = useRef(false);
  const isLoadingDataRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const MIN_RELOAD_MS = 2500;

  // Active filter
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);

  // Modals
  const [collDropdownOpen, setCollDropdownOpen] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [queuedCreateModalOpen, setQueuedCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [queuedEditTarget, setQueuedEditTarget] = useState<Collection | null>(null);
  const [queuedDeleteTarget, setQueuedDeleteTarget] = useState<Collection | null>(null);

  // Edit sheet state
  const [editTarget, setEditTarget] = useState<Collection | null>(null);
  const [editName, setEditName] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'private' | 'specific'>('private');
  const [editCollaborators, setEditCollaborators] = useState<any[]>([]);
  const [editAllowedUsers, setEditAllowedUsers] = useState<string[]>([]);
  const [editAllowedGroups, setEditAllowedGroups] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editSubScreen, setEditSubScreen] = useState<'main' | 'visibility' | 'invite'>('main');

  // Groups and Followers for Visibility/Collabs
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [tempSelectedGroups, setTempSelectedGroups] = useState<string[]>([]);
  const [tempSelectedCollaborators, setTempSelectedCollaborators] = useState<any[]>([]);
  const [followerSearch, setFollowerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const getKeyboardOffset = () => {
    if ((Platform.OS as any) === 'ios') return 0;
    return 0;
  };

  // Post Viewer Modal State
  const [postViewerVisible, setPostViewerVisible] = useState(false);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [savedPosts, setSavedPosts] = useState<Record<string, boolean>>({});

  // Comment Modal State (inside viewer)
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalPostId, setCommentModalPostId] = useState("");
  const [commentModalAvatar, setCommentModalAvatar] = useState("");
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();

  const SAVED_CACHE_KEY = useCallback((userId: string) => `saved_v1_${String(userId || 'anon')}`, []);

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async (forcedUid?: string, options?: { force?: boolean }) => {
    const activeUid = forcedUid || uid;
    if (!activeUid) return;

    // Cache-first bootstrap: show cached content immediately
    try {
      const cached = await getCachedData<any>(SAVED_CACHE_KEY(activeUid));
      if (cached && !hasLoadedOnceRef.current) {
        if (Array.isArray(cached.collections)) setCollections(cached.collections);
        if (Array.isArray(cached.allSavedPosts)) setAllSavedPosts(cached.allSavedPosts);
        if (cached.likedPosts && typeof cached.likedPosts === 'object') setLikedPosts(cached.likedPosts);
        if (cached.savedPosts && typeof cached.savedPosts === 'object') setSavedPosts(cached.savedPosts);
        setLoading(false);
      }
    } catch { }

    const shouldThrottle =
      !options?.force &&
      hasLoadedOnceRef.current &&
      Date.now() - lastLoadAtRef.current < MIN_RELOAD_MS;

    if (shouldThrottle || isLoadingDataRef.current) {
      return;
    }

    isLoadingDataRef.current = true;
    const requesterId = currentUserId || activeUid;
    if (!hasLoadedOnceRef.current) setLoading(true);

    // If we're offline, don't block — rely on cache if available
    if (!isOnline && hasLoadedOnceRef.current) {
      isLoadingDataRef.current = false;
      setLoading(false);
      return;
    }
    try {
      const [uidAlias, firebaseAlias] = await Promise.all([
        AsyncStorage.getItem('uid'),
        AsyncStorage.getItem('firebaseUid'),
      ]);

      const idCandidates = Array.from(new Set([
        activeUid,
        requesterId,
        targetUserId || null,
        uidAlias,
        firebaseAlias,
      ].filter(Boolean).map((v) => String(v))));
      const cappedCandidates = idCandidates.slice(0, 3);

      if (__DEV__) {
        console.log('[saved.tsx] loadData id candidates:', cappedCandidates);
      }

      const sectionsById = new Map<string, any>();
      const savedById = new Map<string, any>();

      let hasSections = false;
      let hasSaved = false;

      for (const candidateId of cappedCandidates) {
        const [sectRes, postsRes] = await Promise.all([
          apiService.get(`/users/${candidateId}/sections`, {
            viewerId: requesterId || undefined,
            requesterId: requesterId || undefined,
            requesterUserId: requesterId || undefined,
          }),
          apiService.get(`/users/${candidateId}/saved`, {
            viewerId: requesterId || undefined,
            requesterId: requesterId || undefined,
            requesterUserId: requesterId || undefined,
          }),
        ]);

        const sectionsData = sectRes?.success && Array.isArray(sectRes.data) ? sectRes.data : [];
        const savedData = Array.isArray(postsRes?.data) ? postsRes.data : (Array.isArray(postsRes) ? postsRes : []);

        if (__DEV__) {
          console.log('[saved.tsx] candidate result:', {
            candidateId,
            sectionsCount: sectionsData.length,
            savedCount: savedData.length,
            sectionsSuccess: !!sectRes?.success,
            savedSuccess: !!postsRes?.success,
          });
        }

        sectionsData.forEach((section: any) => {
          const sectionKey = String(section?._id || section?.id || `${section?.userId || 'u'}:${section?.name || 'section'}`);
          if (sectionKey && !sectionsById.has(sectionKey)) {
            sectionsById.set(sectionKey, section);
          }
        });

        savedData.forEach((post: any) => {
          const postKey = String(post?._id || post?.id || '');
          if (postKey && !savedById.has(postKey)) {
            savedById.set(postKey, post);
          }
        });

        if (sectionsData.length > 0) hasSections = true;
        if (savedData.length > 0) hasSaved = true;
        if (hasSections && hasSaved) break;
      }

      const mergedSections = Array.from(sectionsById.values());
      const mergedSavedRaw = Array.from(savedById.values());

      setCollections(mergedSections);

      if (__DEV__) {
        console.log('[saved.tsx] selected best result:', {
          bestSections: mergedSections.length,
          bestSaved: mergedSavedRaw.length,
        });
      }

      setAllSavedPosts(mergedSavedRaw.map((p: any) => ({
        ...p,
        id: p._id || p.id,
        imageUrl: p.mediaUrl || p.imageUrl || (Array.isArray(p.mediaUrls) ? p.mediaUrls[0] : '') || '',
      })));

      // Initialize liked/saved maps
      const likes: Record<string, boolean> = {};
      const saves: Record<string, boolean> = {};
      mergedSavedRaw.forEach((p: any) => {
        const pid = p._id || p.id;
        if (pid) {
          likes[pid] = Array.isArray(p.likes) && p.likes.includes(currentUserId || "");
          saves[pid] = true;
        }
      });
      setLikedPosts(likes);
      setSavedPosts(saves);

      // Persist cache snapshot for offline mode
      try {
        await setCachedData(SAVED_CACHE_KEY(activeUid), {
          collections: mergedSections,
          allSavedPosts: mergedSavedRaw.map((p: any) => ({
            ...p,
            id: p._id || p.id,
            imageUrl: p.mediaUrl || p.imageUrl || (Array.isArray(p.mediaUrls) ? p.mediaUrls[0] : '') || '',
          })),
          likedPosts: likes,
          savedPosts: saves,
        }, { ttl: 24 * 60 * 60 * 1000 });
      } catch { }
    } catch (e) {
      console.error('[saved.tsx] Error loading data:', e);
    } finally {
      isLoadingDataRef.current = false;
      lastLoadAtRef.current = Date.now();
      setLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }, [uid, currentUserId]);

  const loadGroups = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingGroups(true);
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const res = await apiService.get(`/groups?userId=${currentUserId}`);
      if (res?.success && Array.isArray(res.data)) setGroups(res.data);
    } catch (e) { console.error('loadGroups error', e); }
    finally { setLoadingGroups(false); }
  }, [currentUserId]);

  const loadFollowers = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingFollowers(true);
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const res = await apiService.get(`/users/${currentUserId}/followers`);
      const list = res?.data || res || [];
      setFollowers(Array.isArray(list) ? list : []);
    } catch (e) { console.error('loadFollowers error', e); }
    finally { setLoadingFollowers(false); }
  }, [currentUserId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (followerSearch.trim().length > 1) {
        setSearching(true);
        try {
          const { apiService } = await import('@/src/_services/apiService');
          const res = await apiService.get(`/users/search?q=${encodeURIComponent(followerSearch)}&requesterUserId=${currentUserId}`);
          if (res?.success && Array.isArray(res.data)) {
            const normalized = res.data.map((u: any) => ({
              ...u,
              uid: u._id || u.firebaseUid,
              name: u.displayName || u.name || 'User',
              avatar: u.avatar || u.photoURL || u.profilePicture || ''
            }));
            setSearchResults(normalized);
          }
        } catch (e) { console.error('search error', e); }
        finally { setSearching(false); }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [followerSearch, currentUserId]);

  const handleModalClose = useCallback(() => {
    setCreateModalVisible(false);
    // Explicitly pass the current uid to ensure we don't use a stale state
    if (uid) {
      if (justCreatedCollectionRef.current) {
        justCreatedCollectionRef.current = false;
        setTimeout(() => {
          loadData(uid, { force: true });
        }, 700);
      } else {
        console.log('[saved.tsx] Refreshing data after modal close for uid:', uid);
        loadData(uid, { force: true });
      }
    }
  }, [uid, loadData]);

  // Use useFocusEffect from expo-router to handle tab re-focus and param changes
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const checkUser = async () => {
        const id = await resolveCanonicalUserId(targetUserId);
        if (!isMounted) return;
        setCurrentUserId(id);
        const nextUid = id;
        setUid(nextUid);
        if (nextUid) loadData(nextUid);
      };
      checkUser();
      return () => { isMounted = false; };
    }, [targetUserId, loadData])
  );

  // ── Computed posts ────────────────────────────────────────────────────────

  const displayedPosts: SavedPost[] = activeCollection
    ? allSavedPosts.filter(p => activeCollection.postIds?.includes(p.id))
    : allSavedPosts;

  const isOwner = (col: Collection) => {
    const candidates = [currentUserId, uid].filter(Boolean).map(v => String(v));
    return candidates.includes(String(col.userId));
  };
  const isProfileOwner = !targetUserId || targetUserId === currentUserId;

  const visibleCollections = collections.filter(col => {
    if (isProfileOwner) return true;
    // Public is always visible
    if (!col.visibility || col.visibility === 'public') return true;
    // Check collaborators for private/specific visibility
    const collaborators = Array.isArray(col.collaborators) ? col.collaborators : [];
    const viewerId = String(currentUserId || '');
    return collaborators.some((c: any) => {
      const cid = typeof c === 'string' ? c : (c.userId || c.uid || c._id || c.firebaseUid);
      return String(cid) === viewerId;
    });
  });

  // ── Collection selection ──────────────────────────────────────────────────

  const selectCollection = (col: Collection | null) => {
    hapticLight();
    setActiveCollection(col);
    setCollDropdownOpen(false);
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const applyEditState = useCallback((col: Collection) => {
    setEditTarget(col);
    setEditName(col.name);
    setEditVisibility((col.visibility as any) || 'private');
    setEditCollaborators(col.collaborators || []);
    setEditAllowedUsers(col.allowedUsers || []);
    setEditAllowedGroups((col as any).allowedGroups || []);
    setEditSubScreen('main');
    setCollDropdownOpen(false);
    
    // Initialize temp states
    setTempSelectedGroups((col as any).allowedGroups || []);
    setTempSelectedCollaborators(col.collaborators || []);
    setFollowerSearch('');
    
    loadGroups();
    loadFollowers();
  }, [loadGroups, loadFollowers]);

  const openEdit = (col: Collection) => {
    setQueuedDeleteTarget(null);

    if ((Platform.OS as any) === 'ios') {
      setQueuedEditTarget(col);
      setCollDropdownOpen(false);
      return;
    }

    if (collDropdownOpen) {
      setCollDropdownOpen(false);
      setTimeout(() => applyEditState(col), 40);
      return;
    }

    applyEditState(col);
  };

  const openDelete = (col: Collection) => {
    setQueuedEditTarget(null);

    if ((Platform.OS as any) === 'ios') {
      setQueuedDeleteTarget(col);
      setCollDropdownOpen(false);
      return;
    }

    if (collDropdownOpen) {
      setCollDropdownOpen(false);
      setTimeout(() => setDeleteTarget(col), 40);
      return;
    }

    setDeleteTarget(col);
  };

  useEffect(() => {
    if ((Platform.OS as any) === 'ios') return;
    if (collDropdownOpen || !queuedEditTarget) return;

    const timer = setTimeout(() => {
      setQueuedEditTarget(null);
      applyEditState(queuedEditTarget);
    }, (Platform.OS as any) === 'ios' ? 120 : 40);

    return () => clearTimeout(timer);
  }, [collDropdownOpen, queuedEditTarget, applyEditState]);

  useEffect(() => {
    if ((Platform.OS as any) === 'ios') return;
    if (collDropdownOpen || !queuedDeleteTarget) return;

    const timer = setTimeout(() => {
      setQueuedDeleteTarget(null);
      setDeleteTarget(queuedDeleteTarget);
    }, 40);

    return () => clearTimeout(timer);
  }, [collDropdownOpen, queuedDeleteTarget]);

  useEffect(() => {
    const subscription = feedEventEmitter.addListener('feedUpdated', () => {
      if (uid) loadData(uid);
    });

    return () => {
      subscription.remove();
    };
  }, [uid, loadData]);

  const saveEdit = async () => {
    if (!uid || !editTarget || !editName.trim()) return;
    setEditSaving(true);
    try {
      const { updateUserSection } = await import('../../lib/firebaseHelpers');
      const sectionIdentifier = String(editTarget?._id || editTarget?.name || '').trim();
      const requester = String(currentUserId || uid || '');
      const collaboratorsPayload = editCollaborators.map(u =>
        typeof u === 'string' ? u : (u.firebaseUid || u._id || (u as any).userId || (u as any).uid)
      ).filter(Boolean);

      const res = await updateUserSection(uid, sectionIdentifier, {
        name: editName.trim(),
        visibility: editVisibility,
        collaborators: collaboratorsPayload,
        allowedUsers: editAllowedUsers,
        allowedGroups: tempSelectedGroups,
      }, requester);

      if (res?.success) {
        setCollections(prev => prev.map(c =>
          c._id === editTarget._id
            ? {
                ...c,
                name: editName.trim(),
                visibility: editVisibility,
                collaborators: editCollaborators,
                allowedUsers: editAllowedUsers,
                allowedGroups: tempSelectedGroups,
              }
            : c
        ));
        if (activeCollection?._id === editTarget._id) {
          setActiveCollection(prev => prev
            ? {
                ...prev,
                name: editName.trim(),
                visibility: editVisibility,
                collaborators: editCollaborators,
                allowedUsers: editAllowedUsers,
                allowedGroups: tempSelectedGroups,
              }
            : prev
          );
        }
        setEditTarget(null);
        // Refresh data to be sure
        loadData(undefined, { force: true });
      }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
    setEditTarget(null);
  };

  const toggleEditGroup = (group: any) => {
    const gid = group._id;
    setTempSelectedGroups(prev => {
      const exists = prev.some(sid => String(sid) === String(gid));
      const next = exists
        ? prev.filter(sid => String(sid) !== String(gid))
        : [...prev, String(gid)];
      
      // Sync editAllowedUsers
      let allMembers: string[] = [];
      groups.filter(g => next.includes(g._id)).forEach(g => {
        if (Array.isArray(g.members)) allMembers = [...allMembers, ...g.members];
      });
      setEditAllowedUsers([...new Set(allMembers)]);
      
      return next;
    });
  };

  const isSameUser = (u1: any, u2: any) => {
    if (!u1 || !u2) return false;
    if (typeof u1 === 'string' && typeof u2 === 'string') return u1 === u2;
    
    const getIds = (u: any) => {
      if (typeof u === 'string') return [u];
      return [
        u._id ? String(u._id) : null,
        u.id ? String(u.id) : null,
        u.uid ? String(u.uid) : null,
        u.firebaseUid ? String(u.firebaseUid) : null
      ].filter(Boolean);
    };
    
    const ids1 = getIds(u1);
    const ids2 = getIds(u2);
    return ids1.some(id => ids2.includes(id));
  };

  const toggleEditCollab = (user: any) => {
    setTempSelectedCollaborators(prev => {
      const exists = prev.some((u: any) => isSameUser(u, user));
      if (exists) {
        return prev.filter((u: any) => !isSameUser(u, user));
      }
      return [...prev, user];
    });
  };

  const confirmEditInvite = () => {
    setEditCollaborators([...tempSelectedCollaborators]);
    setEditSubScreen('main');
  };

  // ── Post Handlers (for Viewer) ─────────────────────────────────────────────

  const handleLikePost = async (post: SavedPost) => {
    if (!currentUserId) return;
    const pid = post.id;
    const isLiked = likedPosts[pid];
    
    // Optimistic update
    setLikedPosts(prev => ({ ...prev, [pid]: !isLiked }));
    
    try {
      const { likePost, unlikePost } = await import('../../lib/firebaseHelpers/post');
      if (isLiked) await unlikePost(pid, currentUserId);
      else await likePost(pid, currentUserId);
    } catch (e) {
      console.error("Error liking post:", e);
      setLikedPosts(prev => ({ ...prev, [pid]: isLiked })); // Revert
    }
  };

  const handleSavePost = async (post: SavedPost) => {
    if (!currentUserId) return;
    const pid = post.id;
    const isSaved = savedPosts[pid];
    
    // Optimistic update
    setSavedPosts(prev => ({ ...prev, [pid]: !isSaved }));
    
    try {
      const { savePost, unsavePost } = await import('../../lib/firebaseHelpers/post');
      if (isSaved) await unsavePost(pid, currentUserId);
      else await savePost(pid, currentUserId);
    } catch (e) {
      console.error("Error saving post:", e);
      setSavedPosts(prev => ({ ...prev, [pid]: isSaved })); // Revert
    }
  };

  const handleSharePost = (post: any) => {
    sharePost(post);
  };

  // ── Title ─────────────────────────────────────────────────────────────────

  const pageTitle = activeCollection?.name || 'All Collection';

  // ── Thumb helper ──────────────────────────────────────────────────────────

  const getCollThumb = (col: Collection) =>
    col.coverImage
    || allSavedPosts.find(p => col.postIds?.includes(p.id))?.imageUrl
    || '';

  // ─── Renders ──────────────────────────────────────────────────────────────

  // Grid
  const renderGrid = () => {
    if (loading) return <ActivityIndicator color="#0A3D62" style={{ marginTop: 60 }} size="large" />;
    if (displayedPosts.length === 0) return (
      <View style={styles.emptyWrap}>
        <Feather name="bookmark" size={48} color="#ddd" />
        <Text style={styles.emptyText}>
          {activeCollection ? 'No posts in this collection.' : 'No saved posts yet.'}
        </Text>
      </View>
    );
    return (
      <FlatList
        data={displayedPosts}
        keyExtractor={item => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => {
              hapticLight();
              setSelectedPostIndex(index);
              setPostViewerVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.gridImg} />
          </TouchableOpacity>
        )}
      />
    );
  };

  // Collections bottom-sheet
  const renderCollDropdown = () => (
    <Modal
      visible={collDropdownOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setCollDropdownOpen(false)}
      onDismiss={() => {
        if (queuedCreateModalOpen) {
          setQueuedCreateModalOpen(false);
          setTimeout(() => setCreateModalVisible(true), (Platform.OS as any) === 'ios' ? 140 : 50);
          return;
        }

        if (queuedDeleteTarget) {
          const target = queuedDeleteTarget;
          setQueuedDeleteTarget(null);
          setTimeout(() => setDeleteTarget(target), (Platform.OS as any) === 'ios' ? 140 : 50);
          return;
        }

        if (queuedEditTarget) {
          const target = queuedEditTarget;
          setQueuedEditTarget(null);
          setTimeout(() => applyEditState(target), (Platform.OS as any) === 'ios' ? 140 : 50);
        }
      }}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <TouchableWithoutFeedback onPress={() => setCollDropdownOpen(false)}>
        <View style={styles.sheetBackdrop} />
      </TouchableWithoutFeedback>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.dragHandle} />

        {/* "All" row */}
        <TouchableOpacity style={styles.allRow} onPress={() => selectCollection(null)} activeOpacity={0.75}>
          {allSavedPosts[0]?.imageUrl ? (
            <Image source={{ uri: allSavedPosts[0].imageUrl }} style={styles.allThumb} />
          ) : (
            <View style={[styles.allThumb, { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
              <Feather name="image" size={16} color="#ccc" />
            </View>
          )}
          <Text style={[styles.allLabel, !activeCollection && { color: '#0A3D62', fontWeight: '700' }]}>All</Text>
          {!activeCollection && <Feather name="check" size={16} color="#0A3D62" style={{ marginLeft: 'auto' }} />}
        </TouchableOpacity>

        {/* Collections header */}
        <View style={styles.collSectionHeader}>
          <Text style={styles.collSectionTitle}>Collections</Text>
          {isProfileOwner && (
            <TouchableOpacity
              onPress={() => {
                hapticLight();
                setQueuedCreateModalOpen(true);
                setCollDropdownOpen(false);
              }}
            >
              <Text style={styles.newCollText}>New collection</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Collections list */}
        <ScrollView style={{ maxHeight: SCREEN_H * 0.48 }} showsVerticalScrollIndicator={false}>
          {visibleCollections.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ color: '#bbb', fontSize: 14 }}>No collections yet</Text>
            </View>
          ) : (
            visibleCollections.map(col => {
              const thumb = getCollThumb(col);
              const active = activeCollection?._id === col._id;
              return (
                <View key={col._id} style={styles.collRow}>
                  <TouchableOpacity
                    style={styles.collRowMain}
                    onPress={() => selectCollection(col)}
                    activeOpacity={0.75}
                  >
                    {/* Thumbnail */}
                    {thumb ? (
                      <ExpoImage source={{ uri: thumb }} style={styles.collThumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.collThumb, styles.thumbPlaceholder]}>
                        <Feather name="image" size={16} color="#ccc" />
                      </View>
                    )}

                    {/* Name */}
                    <Text style={[styles.collName, active && { color: '#0A3D62', fontWeight: '700' }]} numberOfLines={1}>
                      {col.name}
                    </Text>

                    {/* Active check */}
                    {active && <Feather name="check" size={16} color="#0A3D62" style={{ marginRight: 8 }} />}
                  </TouchableOpacity>

                  {/* ⊗ Delete (owner only) */}
                  {isProfileOwner && isOwner(col) && (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => {
                        openDelete(col);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle-outline" size={22} color="#aaa" />
                    </TouchableOpacity>
                  )}

                  {/* ✏️ Edit (owner only) */}
                  {isProfileOwner && isOwner(col) && (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => {
                        openEdit(col);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      activeOpacity={0.7}
                    >
                      <Feather name="edit-2" size={17} color="#aaa" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  // Edit collection bottom sheet
  const renderEditSheet = () => {
    if (!editTarget) return null;
    const isOwnerOfColl = editTarget.userId === currentUserId;
    return (
      <Modal
        visible={!!editTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheetBackdrop} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={(Platform.OS as any) === 'ios' ? 'padding' : undefined}
          enabled={(Platform.OS as any) === 'ios'}
          style={{ justifyContent: 'flex-end', flex: 1 }}
          keyboardVerticalOffset={(Platform.OS as any) === 'ios' ? 0 : 0}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 8, minHeight: SCREEN_H * 0.5 }]}>
            <View style={styles.dragHandle} />

            {editSubScreen === 'main' ? (
              <>
                {/* Header */}
                <View style={styles.editHeader}>
                  <TouchableOpacity
                    onPress={() => setEditTarget(null)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.editCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.editTitle}>Edit collection</Text>
                  <TouchableOpacity
                    onPress={saveEdit}
                    disabled={editSaving || !editName.trim()}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={[styles.editSave, (!editName.trim() || editSaving) && { color: '#ccc' }]}>
                      {editSaving ? '...' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Cover image */}
                {(editTarget.coverImage || getCollThumb(editTarget)) ? (
                  <ExpoImage
                    source={{ uri: editTarget.coverImage || getCollThumb(editTarget) }}
                    style={styles.editCover}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.editCover, styles.thumbPlaceholder]}>
                    <Feather name="image" size={32} color="#ccc" />
                  </View>
                )}

                {/* Name input */}
                <View style={styles.nameInputWrap}>
                  <TextInput
                    style={styles.nameInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Collection name"
                    placeholderTextColor="#ccc"
                    returnKeyType="done"
                    editable={isOwnerOfColl}
                  />
                </View>

                {/* Visibility row */}
                {isOwnerOfColl && (
                  <TouchableOpacity style={styles.optionRow} onPress={() => setEditSubScreen('visibility')}>
                    <Ionicons name="eye-outline" size={20} color="#444" />
                    <Text style={styles.optionLabel}>Visibility</Text>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionValue}>
                        {editVisibility === 'public' ? 'Public' : 'Private'}
                      </Text>
                      <Feather name="chevron-right" size={18} color="#aaa" />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Invite row */}
                {isOwnerOfColl && (
                  <TouchableOpacity style={styles.optionRow} onPress={() => { setTempSelectedCollaborators([...editCollaborators]); setEditSubScreen('invite'); }}>
                    <Ionicons name="person-add-outline" size={20} color="#444" />
                    <Text style={styles.optionLabel}>Invite an other person to collaborate</Text>
                    <Feather name="chevron-right" size={18} color="#aaa" />
                  </TouchableOpacity>
                )}

                {/* Collaborator chips */}
                {editCollaborators.length > 0 && (
                    <Text style={styles.collabChipsInline}>
                      Collaborators: {editCollaborators.map(u => {
                        const name = typeof u === 'string' ? u : (u.name || u.displayName || u.username);
                        return name || 'Collaborator';
                      }).join(', ')}
                    </Text>
                )}

                {/* Delete button (Owner only) */}
                {isOwnerOfColl && (
                  <TouchableOpacity 
                    style={[styles.optionRow, { marginTop: 12, borderBottomWidth: 0 }]} 
                    onPress={() => { setDeleteTarget(editTarget); setEditTarget(null); }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                    <Text style={[styles.optionLabel, { color: '#ff3b30' }]}>Delete Collection</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : editSubScreen === 'visibility' ? (
              // Visibility picker
              <>
                <View style={styles.editHeader}>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setEditSubScreen('main'); }}>
                    <Text style={styles.editCancel}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.editTitle}>Visibility</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setEditSubScreen('main'); }}>
                    <Text style={styles.editSave}>Done</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ flex: 1 }}>
                  {(['public', 'private'] as const).map(v => (
                    <View key={v}>
                      <TouchableOpacity
                        style={styles.radioRow}
                        onPress={() => { 
                          setEditVisibility(v); 
                          setEditSubScreen('main'); 
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.radioLabel}>
                            {v === 'public' ? 'Public' : 'Private'}
                          </Text>
                          <Text style={styles.radioSub}>
                            {v === 'public' ? 'Anyone can see this' : 'Only you can see this'}
                          </Text>
                        </View>
                        <View style={[styles.radioCircle, editVisibility === v && styles.radioCircleActive]}>
                          {editVisibility === v && <View style={styles.radioDot} />}
                        </View>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : (
              // Invite sub-screen
              <>
                <View style={styles.editHeader}>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setEditSubScreen('main'); }}>
                    <Text style={styles.editCancel}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.editTitle}>Invite</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); confirmEditInvite(); }}>
                    <Text style={styles.editSave}>Done</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={[styles.searchWrapEdit, { height: 46, borderRadius: 23, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#eef0f2' }]}>
                  <Ionicons name="search" size={18} color="#0A3D62" />
                  <TextInput
                    style={[styles.searchInputEdit, { fontSize: 15 }]}
                    placeholder="Search people to invite..."
                    placeholderTextColor="#99aab5"
                    value={followerSearch}
                    onChangeText={setFollowerSearch}
                    autoFocus={false}
                  />
                  {followerSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setFollowerSearch('')}>
                      <Ionicons name="close-circle" size={18} color="#ccc" />
                    </TouchableOpacity>
                  )}
                </View>

                {searching ? (
                  <ActivityIndicator color="#0A3D62" style={{ marginTop: 20 }} />
                ) : (
                  <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                    {(followerSearch.trim().length > 1 ? searchResults : followers.filter(f => 
                      (f.name || f.username || '').toLowerCase().includes(followerSearch.toLowerCase())
                    )).map(f => {
                      const sel = tempSelectedCollaborators.some((u: any) => isSameUser(u, f));
                      return (
                        <TouchableOpacity key={f._id || f.uid || f.firebaseUid} style={styles.userRowEdit} onPress={() => toggleEditCollab(f)}>
                          <ExpoImage source={{ uri: f.avatar }} style={styles.userAvatarEdit} contentFit="cover" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.userNameEdit}>{f.name || f.username}</Text>
                            {f.username ? <Text style={styles.userHandleEdit}>@{f.username}</Text> : null}
                          </View>
                          <View style={[styles.radioCircle, sel && styles.radioCircleActive]}>
                            {sel && <View style={styles.radioDot} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  // ─── Root ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {showBanner && (
        <OfflineBanner text="You’re offline — showing saved collections" />
      )}
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle} numberOfLines={1}>{pageTitle}</Text>
        <TouchableOpacity
          style={styles.dropBtn}
          onPress={() => {
            hapticLight();
            setCollDropdownOpen(true);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.dropBtnLabel}>Collections</Text>
          <Feather name="chevron-down" size={14} color="#0A3D62" />
        </TouchableOpacity>
      </View>

      {/* All posts / filtered grid */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {renderGrid()}
      </ScrollView>

      {/* Collections bottom sheet */}
      {renderCollDropdown()}

      {/* Edit sheet */}
      {renderEditSheet()}

      {/* Create new collection */}
      <SaveToCollectionModal
        visible={createModalVisible}
        onClose={handleModalClose}
        postId=""
        postImageUrl={undefined}
        currentUserId={currentUserId || uid || undefined}
        onCollectionCreated={(collection) => {
          justCreatedCollectionRef.current = true;
          setCollections(prev => [collection, ...prev.filter(c => c._id !== collection._id)]);
        }}
      />

      {/* Instagram-style Post Viewer */}
      {React.createElement(PostViewerModal as any, {
        visible: postViewerVisible,
        onClose: () => setPostViewerVisible(false),
        posts: displayedPosts,
        selectedPostIndex: selectedPostIndex,
        profile: null, // Multiple authors in saved feed, modal will handle user info if it can
        authUser: currentUserId ? { uid: currentUserId } : null,
        likedPosts: likedPosts,
        savedPosts: savedPosts,
        handleLikePost: handleLikePost,
        handleSavePost: handleSavePost,
        handleSharePost: handleSharePost,
        setCommentModalPostId: (id: any) => setCommentModalPostId(id || ''),
        setCommentModalAvatar: setCommentModalAvatar,
        setCommentModalVisible: setCommentModalVisible,
        title: "Saved Post",
      })}

      <Modal
        visible={commentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          hapticLight();
          setCommentModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={(Platform.OS as any) === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={getKeyboardOffset()}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              activeOpacity={1}
              style={{ flex: 1 }}
              onPress={() => {
                hapticLight();
                setCommentModalVisible(false);
              }}
            />
            <View style={{ backgroundColor: '#fff', height: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
              <View style={{ width: 40, height: 4, backgroundColor: '#eee', borderRadius: 2, alignSelf: 'center', marginVertical: 10 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' }}>
                <Text style={{ fontWeight: '700', fontSize: 16 }}>Comments</Text>
                <TouchableOpacity
                  onPress={() => {
                    hapticLight();
                    setCommentModalVisible(false);
                  }}
                >
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <CommentSection
                postId={commentModalPostId}
                postOwnerId="" // Optional
                currentAvatar={commentModalAvatar}
                currentUser={currentUserId ? { uid: currentUserId } : null}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete modal */}
      <CollectionDeleteModal
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        collection={deleteTarget}
        allCollections={collections}
        currentUserId={currentUserId || uid || undefined}
        onDeleted={(id) => {
          setCollections(prev => prev.filter(c => c._id !== id));
          setDeleteTarget(null);
          if (activeCollection?._id === id) setActiveCollection(null);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    flex: 1,
  },
  dropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF3F8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  dropBtnLabel: { fontSize: 13, fontWeight: '600', color: '#0A3D62' },

  // Grid
  grid: { padding: 1 },
  gridItem: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 1,
    backgroundColor: '#f0f0f0',
  },
  gridImg: { width: '100%', height: '100%', resizeMode: 'cover' },

  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, color: '#bbb', marginTop: 12, textAlign: 'center' },

  // Bottom sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: SCREEN_H * 0.86,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },

  // "All" row inside sheet
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f5f5f5',
  },
  allThumb: {
    width: 44, height: 44,
    borderRadius: 10,
    marginRight: 12,
    overflow: 'hidden',
  },
  allLabel: { fontSize: 15, color: '#111', fontWeight: '500' },

  // Collections section header inside sheet
  collSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  collSectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  newCollText: { fontSize: 14, color: '#0A3D62', fontWeight: '600' },

  // Collection row inside sheet
  collRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f8f8f8',
  },
  collRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  collThumb: {
    width: 48, height: 48,
    borderRadius: 10,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  collName: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },
  iconBtn: { padding: 6 },

  // Edit sheet
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  editCancel: { fontSize: 15, color: '#555', fontWeight: '500' },
  editTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  editSave: { fontSize: 15, color: '#0A3D62', fontWeight: '700' },
  editCover: {
    width: 130, height: 130,
    borderRadius: 14,
    alignSelf: 'center',
    marginVertical: 16,
    backgroundColor: '#f0f0f0',
  },
  nameInputWrap: {
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginBottom: 4,
  },
  nameInput: { fontSize: 16, color: '#111', paddingVertical: 10 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  optionLabel: { flex: 1, fontSize: 14, color: '#222' },
  optionRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  optionValue: { fontSize: 13, color: '#888' },

  // Visibility picker
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  radioLabel: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 2 },
  radioSub: { fontSize: 12, color: '#999' },
  radioCircle: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  radioCircleActive: { borderColor: '#0A3D62' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0A3D62' },

  // New Edit sheet styles
  collabInfoInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 6,
  },
  collabChipsInline: {
    fontSize: 12,
    color: '#0A3D62',
    fontWeight: '500',
    flex: 1,
  },
  groupSectionEdit: {
    paddingLeft: 44,
    paddingRight: 16,
    paddingBottom: 16,
    backgroundColor: '#fafafa',
  },
  infoText: {
    fontSize: 12,
    color: '#888',
    marginVertical: 8,
    fontStyle: 'italic',
  },
  groupRowEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  groupNameEdit: {
    fontSize: 14,
    color: '#444',
  },
  groupNameSelectedEdit: {
    color: '#0A3D62',
    fontWeight: '700',
  },
  searchWrapEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 23,
    height: 46,
    gap: 10,
    borderWidth: 1,
    borderColor: '#eef0f2',
  },
  searchInputEdit: {
    flex: 1,
    fontSize: 14,
    color: '#111',
  },
  userRowEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  userAvatarEdit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#eee',
  },
  userNameEdit: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  userHandleEdit: {
    fontSize: 13,
    color: '#888',
  },
});
