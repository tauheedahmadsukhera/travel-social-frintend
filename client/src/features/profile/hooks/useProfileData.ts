import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/src/_services/apiService';
import { fetchBlockedUserIds } from '@/services/moderation';

interface UseProfileDataParams {
  viewedUserId: string | undefined;
  currentUserId: string | null;
  enabled: boolean;
}

export function useProfileData({ viewedUserId, currentUserId, enabled }: UseProfileDataParams) {
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
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const profileData = profileQuery.data;
  const canViewPrivateProfile = !!profileData?.hasAccess;

  // 2. Fetch User Posts
  const postsQuery = useQuery({
    queryKey: ['profilePosts', viewedUserId],
    queryFn: async () => {
      if (!viewedUserId) return [];
      const res = await apiService.getUserPosts(viewedUserId, { viewerId: currentUserId });
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
    enabled: enabled && !!viewedUserId && canViewPrivateProfile,
    staleTime: 1000 * 60 * 2,
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
    staleTime: 1000 * 60 * 5,
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
    staleTime: 1000 * 60 * 1, // Stories change frequently
  });

  // 5. Fetch Saved Posts (if viewing own profile)
  const isOwnProfile = viewedUserId === currentUserId;
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
    staleTime: 1000 * 60 * 5,
  });

  return {
    profile: profileQuery.data,
    posts: postsQuery.data || [],
    sections: sectionsQuery.data || [],
    userStories: storiesQuery.data || [],
    savedSectionPosts: savedPostsQuery.data || [],
    taggedPosts: taggedPostsQuery.data || [],
    highlights: highlightsQuery.data || [],
    isLoading: profileQuery.isLoading,
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
