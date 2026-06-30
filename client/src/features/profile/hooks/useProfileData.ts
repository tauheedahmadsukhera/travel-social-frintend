import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiService } from '@/src/_services/apiService';
import { fetchBlockedUserIds } from '@/services/moderation';
import { getCachedData, setCachedData } from '@/hooks/useOffline';

interface UseProfileDataParams {
  viewedUserId: string | undefined;
  currentUserId: string | null;
  enabled: boolean;
}

export function useProfileData({ viewedUserId, currentUserId, enabled }: UseProfileDataParams) {
  const queryClient = useQueryClient();
  const cacheKey = useMemo(() => `profile_data_cache_${viewedUserId || 'unknown'}`, [viewedUserId]);

  const [cachedData, setCachedDataState] = useState<any>(null);
  const [isSeedingCache, setIsSeedingCache] = useState(true);

  // Seed React Query cache from local AsyncStorage on mount
  useEffect(() => {
    if (!viewedUserId || !enabled) return;

    async function seedCache() {
      try {
        const cached = await getCachedData<any>(cacheKey);
        if (cached) {
          setCachedDataState(cached);
          if (cached.profile) {
            queryClient.setQueryData(['profile', viewedUserId, currentUserId], cached.profile);
          }
          if (cached.posts && cached.posts.length > 0) {
            queryClient.setQueryData(['profilePosts', viewedUserId], cached.posts);
          }
          if (cached.sections && cached.sections.length > 0) {
            queryClient.setQueryData(['profileSections', viewedUserId], cached.sections);
          }
          if (cached.stories && cached.stories.length > 0) {
            queryClient.setQueryData(['profileStories', viewedUserId], cached.stories);
          }
          if (cached.savedPosts && cached.savedPosts.length > 0) {
            queryClient.setQueryData(['profileSavedPosts', viewedUserId], cached.savedPosts);
          }
          if (cached.taggedPosts && cached.taggedPosts.length > 0) {
            queryClient.setQueryData(['profileTaggedPosts', viewedUserId], cached.taggedPosts);
          }
          if (cached.highlights && cached.highlights.length > 0) {
            queryClient.setQueryData(['profileHighlights', viewedUserId], cached.highlights);
          }
        }
      } catch (err) {
        console.warn('[useProfileData] Cache seeding failed:', err);
      } finally {
        setIsSeedingCache(false);
      }
    }

    seedCache();
  }, [viewedUserId, currentUserId, enabled, queryClient, cacheKey]);

  // 1. Fetch Aggregated Profile Data
  const profileQuery = useQuery({
    queryKey: ['profile', viewedUserId, currentUserId],
    queryFn: async () => {
      if (!viewedUserId) return null;
      const [blockedSet, profileRes] = await Promise.all([
        currentUserId ? fetchBlockedUserIds(currentUserId) : Promise.resolve(new Set<string>()),
        apiService.get(`/users/${viewedUserId}/aggregated`, { requesterUserId: currentUserId }),
      ]);
      
      if (!profileRes.success || !profileRes.data) {
        throw new Error(profileRes.error || 'Failed to fetch profile');
      }
      return profileRes.data;
    },
    enabled: enabled && !!viewedUserId,
    staleTime: 1000 * 30,       // 30 seconds — keep follow/follower state fresh
    gcTime: 1000 * 60 * 30,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const profileData = profileQuery.data || cachedData?.profile;
  const isOwnProfile = viewedUserId === currentUserId;
  // For own profile, always allow access. For others, check hasAccess from server.
  const canViewPrivateProfile = isOwnProfile || !!profileData?.hasAccess;

  // 2. Fetch User Posts
  const postsQuery = useQuery({
    queryKey: ['profilePosts', viewedUserId],
    queryFn: async () => {
      if (!viewedUserId) return [];
      const res = await apiService.getUserPosts(viewedUserId, { viewerId: currentUserId });
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
    enabled: enabled && !!viewedUserId && canViewPrivateProfile,
    staleTime: 1000 * 30, // 30 seconds (down from 5 minutes)
    gcTime: 1000 * 60 * 30,
  });

  // 3. Fetch User Sections (Collections)
  const sectionsQuery = useQuery({
    queryKey: ['profileSections', viewedUserId],
    queryFn: async () => {
      if (!viewedUserId) return [];
      const res = await apiService.get(`/users/${viewedUserId}/sections`, { viewerId: currentUserId });
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
    enabled: enabled && !!viewedUserId && canViewPrivateProfile,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  // 4. Fetch User Stories
  const storiesQuery = useQuery({
    queryKey: ['profileStories', viewedUserId],
    queryFn: async () => {
      if (!viewedUserId) return [];
      try {
        const res = await apiService.get(`/users/${viewedUserId}/stories`);
        return res?.success && Array.isArray(res.data) ? res.data : [];
      } catch (error: any) {
        if (error.response?.status === 404) return [];
        throw error;
      }
    },
    enabled: enabled && !!viewedUserId && canViewPrivateProfile,
    staleTime: 1000 * 60 * 2, // Stories change fairly frequently
    gcTime: 1000 * 60 * 15,
  });

  // 5. Fetch Saved Posts (if viewing own profile)
  const savedPostsQuery = useQuery({
    queryKey: ['profileSavedPosts', viewedUserId],
    queryFn: async () => {
      if (!viewedUserId) return [];
      try {
        const res = await apiService.get(`/users/${viewedUserId}/saved-posts`);
        return res?.success && Array.isArray(res.data) ? res.data : [];
      } catch (error: any) {
        if (error.response?.status === 404) return [];
        throw error;
      }
    },
    enabled: enabled && !!viewedUserId && isOwnProfile,
    staleTime: 1000 * 60 * 5,
  });

  // 6. Fetch Tagged Posts
  const taggedPostsQuery = useQuery({
    queryKey: ['profileTaggedPosts', viewedUserId],
    queryFn: async () => {
      if (!viewedUserId) return [];
      try {
        const res = await apiService.get(`/users/${viewedUserId}/tagged-posts`);
        return res?.success && Array.isArray(res.data) ? res.data : [];
      } catch (error: any) {
        if (error.response?.status === 404) return [];
        throw error;
      }
    },
    enabled: enabled && !!viewedUserId && canViewPrivateProfile,
    staleTime: 1000 * 60 * 10,
  });

  // 7. Fetch Highlights
  const highlightsQuery = useQuery({
    queryKey: ['profileHighlights', viewedUserId],
    queryFn: async () => {
      if (!viewedUserId) return [];
      try {
        const res = await apiService.get(`/users/${viewedUserId}/highlights`);
        const rawHighlights = res?.success && Array.isArray(res.data) ? res.data : [];
        return rawHighlights.map((h: any) => ({
          ...h,
          id: h.id || h._id || String(h._id || ''),
          coverImage: h.coverImage || h.image || (h.items && h.items[0]?.imageUrl) || 'https://via.placeholder.com/150'
        }));
      } catch (error: any) {
        if (error.response?.status === 404) return [];
        throw error;
      }
    },
    enabled: enabled && !!viewedUserId && canViewPrivateProfile,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  // Cache fresh data to AsyncStorage on updates
  const postsData = postsQuery.data;
  const sectionsData = sectionsQuery.data;
  const storiesData = storiesQuery.data;
  const savedPostsData = savedPostsQuery.data;
  const taggedPostsData = taggedPostsQuery.data;
  const highlightsData = highlightsQuery.data;

  useEffect(() => {
    if (!viewedUserId || !profileQuery.data) return;

    setCachedData(cacheKey, {
      profile: profileQuery.data,
      posts: postsData || [],
      sections: sectionsData || [],
      stories: storiesData || [],
      savedPosts: savedPostsData || [],
      taggedPosts: taggedPostsData || [],
      highlights: highlightsData || [],
    }, { ttl: 24 * 60 * 60 * 1000 }).catch((e) => {
      console.warn('[useProfileData] Caching failed:', e);
    });
  }, [viewedUserId, cacheKey, profileQuery.data, postsData, sectionsData, storiesData, savedPostsData, taggedPostsData, highlightsData]);

  // Listen for feed events to invalidate the cache instantly when a post is created, updated, or deleted
  useEffect(() => {
    if (!viewedUserId) return;

    try {
      const { feedEventEmitter } = require('@/lib/feedEventEmitter');

      const unsub = feedEventEmitter.onFeedUpdate((event: any) => {
        if (event.type === 'POST_CREATED') {
          queryClient.invalidateQueries({ queryKey: ['profilePosts', viewedUserId] });
          queryClient.invalidateQueries({ queryKey: ['profile', viewedUserId, currentUserId] });
        } else if (event.type === 'POST_DELETED' && event.postId) {
          queryClient.invalidateQueries({ queryKey: ['profilePosts', viewedUserId] });
          queryClient.invalidateQueries({ queryKey: ['profile', viewedUserId, currentUserId] });
        } else if (event.type === 'POST_UPDATED' && event.postId) {
          queryClient.invalidateQueries({ queryKey: ['profilePosts', viewedUserId] });
        }
      });

      const sub = feedEventEmitter.addListener('feedUpdated', () => {
        queryClient.invalidateQueries({ queryKey: ['profilePosts', viewedUserId] });
      });

      return () => {
        unsub();
        sub.remove();
      };
    } catch (e) {
      console.warn('[useProfileData] Failed to bind feedEventEmitter:', e);
    }
  }, [viewedUserId, currentUserId, queryClient]);

  const showSpinner = profileQuery.isLoading && isSeedingCache && !cachedData?.profile;

  return {
    profile: profileData,
    posts: postsQuery.data || cachedData?.posts || [],
    sections: sectionsQuery.data || cachedData?.sections || [],
    userStories: storiesQuery.data || cachedData?.stories || [],
    savedSectionPosts: savedPostsQuery.data || cachedData?.savedPosts || [],
    taggedPosts: taggedPostsQuery.data || cachedData?.taggedPosts || [],
    highlights: highlightsQuery.data || cachedData?.highlights || [],
    isLoading: showSpinner,
    isRefetching: profileQuery.isRefetching,
    refetchAll: async () => {
      await Promise.all([
        profileQuery.refetch(),
        postsQuery.refetch(),
        sectionsQuery.refetch(),
        storiesQuery.refetch(),
        taggedPostsQuery.refetch(),
        highlightsQuery.refetch(),
        isOwnProfile ? savedPostsQuery.refetch() : Promise.resolve(),
      ]);
    }
  };
}
