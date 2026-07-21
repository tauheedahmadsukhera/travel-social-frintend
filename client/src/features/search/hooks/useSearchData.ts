import { useQuery } from '@tanstack/react-query';
import { getAllPosts, searchUsers } from '@/lib/firebaseHelpers/index';
import { getPostsByHashtag, getTrendingHashtags } from '@/lib/mentions';
import { apiService } from '@/src/_services/apiService';

interface UseSearchDataParams {
  query: string;
  activeTab: 'posts' | 'users' | 'hashtags';
  currentUserId: string | null;
}

export function useSearchData({ query, activeTab, currentUserId }: UseSearchDataParams) {
  // 1. Trending Hashtags
  const trendingQuery = useQuery({
    queryKey: ['trendingHashtags'],
    queryFn: async () => {
      return await getTrendingHashtags(10);
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  // 2. All Posts (Initial exploration)
  const allPostsQuery = useQuery({
    queryKey: ['allPosts'],
    queryFn: async () => {
      const result = await getAllPosts();
      return result.success ? (result.data || []).slice(0, 200) : [];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  // 3. Search Results
  const searchQuery = useQuery({
    queryKey: ['search', activeTab, query.toLowerCase().trim()],
    queryFn: async () => {
      const q = query.toLowerCase().trim();
      if (!q) return [];

      if (activeTab === 'users') {
        const result = await searchUsers(q, 15);
        const users = result.success ? result.data : [];
        return users.filter((u: any) => u.id !== currentUserId && u._id !== currentUserId);
      } 
      
      if (activeTab === 'hashtags') {
        const cleanHashtag = q.replace(/^#+/, '');
        return await getPostsByHashtag(cleanHashtag);
      }

      // Default: Search Posts (including location search)
      const locationHaystack = (post: any) =>
        [
          typeof post.location === 'string' ? post.location : post.location?.name,
          post.locationName,
          post.locationData?.name,
          post.locationData?.address,
          post.locationData?.city,
          post.locationData?.country,
          ...(Array.isArray(post.locationKeys) ? post.locationKeys : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

      // Filter from local cache (allPosts)
      const localMatches = (allPostsQuery.data || []).filter((post: any) => {
        const cap = (post.caption || '').toLowerCase();
        const un = (post.userName || '').toLowerCase();
        return cap.includes(q) || un.includes(q) || locationHaystack(post).includes(q);
      });

      // Fetch from remote location search
      if (q.length >= 2) {
        try {
          const remoteByLoc: any[] = [];
          const locPageSize = 50;
          // We limit remote search for the hook to keep it snappy
          const remote: any = await apiService.getPostsByLocation(
            q,
            0,
            locPageSize,
            currentUserId || undefined
          );
          
          const chunk = remote?.success && Array.isArray(remote?.data) ? remote.data : [];
          
          const byId = new Map<string, any>();
          for (const p of chunk) {
            const id = String(p?.id || p?._id || '');
            if (id) byId.set(id, { ...p, id: p.id || p._id });
          }
          for (const p of localMatches) {
            const id = String(p?.id || p?._id || '');
            if (id && !byId.has(id)) byId.set(id, { ...p, id: p.id || p._id });
          }
          
          return Array.from(byId.values())
            .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 250);
        } catch (e) {
          return localMatches;
        }
      }

      return localMatches;
    },
    enabled: !!query.trim(),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  return {
    trendingHashtags: trendingQuery.data || [],
    allPosts: allPostsQuery.data || [],
    results: query.trim() ? (searchQuery.data || []) : [],
    isLoading: trendingQuery.isLoading || allPostsQuery.isLoading || (!!query.trim() && searchQuery.isLoading),
    isSearching: searchQuery.isLoading,
    refetch: searchQuery.refetch,
  };
}
