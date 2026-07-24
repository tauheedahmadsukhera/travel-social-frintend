import { useCallback, useState, useRef } from 'react';
import { Alert } from 'react-native';
import { apiService } from '../src/services/apiService';
import { feedEventEmitter } from '../lib/feedEventEmitter';

export interface Collection {
  _id: string;
  name: string;
  coverImage?: string;
  postIds: string[];
  visibility: 'public' | 'private' | 'specific';
  collaborators: { userId: string }[];
  userId: string;
}

export function useCollectionLogic(postId: string, currentUid: string | null) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadCollections = useCallback(async () => {
    if (!currentUid) return;
    setLoadingCollections(true);
    try {
      const res = await apiService.get(`/users/${currentUid}/sections`, {
        requesterUserId: currentUid,
        requesterId: currentUid,
        viewerId: currentUid,
      });
      if (res?.success && Array.isArray(res.data)) setCollections(res.data);
      else setCollections([]);
    } catch {
      setCollections([]);
    } finally {
      setLoadingCollections(false);
    }
  }, [currentUid]);

  const togglePostInCollection = async (collectionId: string, showToast: (msg: string) => void) => {
    if (!currentUid || isUpdating) return;
    const col = collections.find(c => c._id === collectionId);
    if (!col) return;
    
    const isCurrentlySaved = col.postIds?.includes(postId);
    setIsUpdating(true);
    try {
      const body = {
        ...(isCurrentlySaved ? { removePostId: postId } : { addPostId: postId }),
        requesterUserId: currentUid,
        viewerId: currentUid,
      };
      const res = await apiService.put(`/users/${currentUid}/sections/${collectionId}`, body);
      if (res?.success) {
        const updatedCols = collections.map(c => 
          c._id === collectionId 
          ? { ...c, postIds: isCurrentlySaved 
              ? (c.postIds || []).filter(id => id !== postId) 
              : [...(c.postIds || []), postId] 
            } 
          : c
        );
        setCollections(updatedCols);
        const inAnyCollection = updatedCols.some(c => c.postIds?.includes(postId));
        feedEventEmitter.emitPostUpdated(postId, { isSaved: inAnyCollection });
        showToast(isCurrentlySaved ? `Removed from ${col.name}` : `Saved to ${col.name}`);
        return updatedCols;
      } else {
        Alert.alert('Error', 'Failed to update collection');
      }
    } catch (e) {
      console.error('[useCollectionLogic] toggle error', e);
    } finally {
      setIsUpdating(false);
    }
    return null;
  };

  const createCollection = async (data: any) => {
    if (!currentUid) return null;
    setSaving(true);
    try {
      const res = await apiService.post(`/users/${currentUid}/sections`, {
        ...data,
        postIds: postId ? [postId] : [],
        requesterUserId: currentUid,
        viewerId: currentUid,
      });
      if (res?.success) {
        const created = (res?.data || res?.section || null) as Collection | null;
        if (created) {
          setCollections(prev => [created, ...prev]);
          if (postId) feedEventEmitter.emitPostUpdated(postId, { isSaved: true });
        }
        return created;
      } else {
        Alert.alert('Error', res?.error || 'Failed to create collection');
      }
    } catch (e) {
      console.error('createCollection error', e);
      Alert.alert('Error', 'Failed to create collection');
    } finally {
      setSaving(false);
    }
    return null;
  };

  return {
    collections,
    loadingCollections,
    isUpdating,
    saving,
    loadCollections,
    togglePostInCollection,
    createCollection,
    setCollections,
  };
}
