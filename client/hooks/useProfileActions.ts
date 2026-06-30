import { useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { followUser, sendFollowRequest, unfollowUser } from '@/lib/firebaseHelpers/follow';
import { apiService } from '@/src/_services/apiService';
import { hapticMedium, hapticLight } from '@/lib/haptics';
import { userService } from '@/lib/userService';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { likePost, unlikePost } from '@/lib/firebaseHelpers/post';
import { sharePost } from '@/lib/postShare';

interface UseProfileActionsProps {
  currentUserId: string | null;
  viewedUserId: string | null;
  isOwnProfile: boolean;
  isPrivate: boolean;
  isFollowing: boolean;
  setIsFollowing: (val: boolean) => void;
  setProfile: (val: any) => void;
  setApprovedFollower: (val: boolean) => void;
  setFollowRequestPending: (val: boolean) => void;
  likedPosts: Record<string, boolean>;
  setLikedPosts: (val: any) => void;
  savedPosts: Record<string, boolean>;
  setSavedPosts: (val: any) => void;
  router: any;
}

export const useProfileActions = ({
  currentUserId,
  viewedUserId,
  isOwnProfile,
  isPrivate,
  isFollowing,
  setIsFollowing,
  setProfile,
  setApprovedFollower,
  setFollowRequestPending,
  likedPosts,
  setLikedPosts,
  savedPosts,
  setSavedPosts,
  router,
}: UseProfileActionsProps) => {
  const [followLoading, setFollowLoading] = useState(false);
  const queryClient = useQueryClient();

  /**
   * Optimistically update the React Query cache for the viewed user's profile.
   * This makes follow/unfollow feel instant (no waiting for a network refetch).
   */
  const optimisticProfileUpdate = (updater: (old: any) => any) => {
    queryClient.setQueryData(
      ['profile', viewedUserId, currentUserId],
      (old: any) => {
        if (!old) return old;
        return updater(old);
      }
    );
  };

  const handleFollowToggle = async () => {
    if (!currentUserId || !viewedUserId || followLoading || isOwnProfile) return;
    hapticMedium();
    setFollowLoading(true);
    try {
      if (isPrivate && !isFollowing) {
        // --- Private account: send follow request ---
        const res = await sendFollowRequest(currentUserId, viewedUserId);
        if (res.success) {
          // Optimistically mark as pending
          optimisticProfileUpdate((old) => ({
            ...old,
            followRequestPending: true,
          }));
          setFollowRequestPending(true);
          Alert.alert('Request Sent', 'Your follow request has been sent to this private account.');
        }
      } else {
        if (isFollowing) {
          // --- Unfollow: optimistic update FIRST ---
          optimisticProfileUpdate((old) => ({
            ...old,
            isFollowing: false,
            isApprovedFollower: false,
            followersCount: Math.max(0, (old.followersCount ?? 0) - 1),
          }));
          setApprovedFollower(false);
          setIsFollowing(false);

          try {
            await unfollowUser(currentUserId, viewedUserId);
            // Background sync: update cache with real server data
            const profileRes = await apiService.get(`/users/${viewedUserId}/aggregated`, {
              requesterUserId: currentUserId,
            });
            if (profileRes.success && profileRes.data) {
              queryClient.setQueryData(
                ['profile', viewedUserId, currentUserId],
                profileRes.data
              );
              setProfile(profileRes.data);
            }
          } catch (err) {
            // Revert on failure
            optimisticProfileUpdate((old) => ({
              ...old,
              isFollowing: true,
              isApprovedFollower: true,
              followersCount: (old.followersCount ?? 0) + 1,
            }));
            setIsFollowing(true);
            setApprovedFollower(true);
            throw err;
          }
        } else {
          // --- Follow: optimistic update FIRST ---
          optimisticProfileUpdate((old) => ({
            ...old,
            isFollowing: true,
            followersCount: (old.followersCount ?? 0) + 1,
          }));
          setIsFollowing(true);

          try {
            await followUser(currentUserId, viewedUserId);
            // Background sync: update cache with real server data
            const profileRes = await apiService.get(`/users/${viewedUserId}/aggregated`, {
              requesterUserId: currentUserId,
            });
            if (profileRes.success && profileRes.data) {
              queryClient.setQueryData(
                ['profile', viewedUserId, currentUserId],
                profileRes.data
              );
              setProfile(profileRes.data);
            }
          } catch (err) {
            // Revert on failure
            optimisticProfileUpdate((old) => ({
              ...old,
              isFollowing: false,
              followersCount: Math.max(0, (old.followersCount ?? 0) - 1),
            }));
            setIsFollowing(false);
            throw err;
          }
        }
      }
    } catch (err) {
      console.error('[handleFollowToggle] Error:', err);
      Alert.alert('Error', 'Failed to update follow status.');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = (profile: any, approvedFollower: boolean) => {
    if (!viewedUserId || !profile) return;
    hapticLight();

    if (isPrivate && !approvedFollower && !isOwnProfile) {
      Alert.alert('Private Account', 'You need to be an approved follower to send messages.');
      return;
    }

    router.push({
      pathname: '/dm',
      params: {
        otherUserId: viewedUserId,
        user: profile.displayName || profile.name || 'User',
        avatar: profile.avatar || ''
      }
    });
  };

  const handleLikePost = async (postId: string) => {
    if (!currentUserId || !postId) return;
    const isLiked = likedPosts[postId];
    // Optimistic update
    setLikedPosts((prev: any) => ({ ...prev, [postId]: !isLiked }));
    
    try {
      if (isLiked) {
        await unlikePost(postId, currentUserId);
      } else {
        await likePost(postId, currentUserId);
      }
    } catch (e) {
      // Revert on error
      setLikedPosts((prev: any) => ({ ...prev, [postId]: isLiked }));
    }
  };

  const handleBlockUser = async (profileName: string) => {
    if (!currentUserId || !viewedUserId || isOwnProfile) return;

    Alert.alert(
      'Block User',
      `Block ${profileName || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await userService.blockUser(currentUserId, viewedUserId);
              if (success) {
                Alert.alert('Blocked', 'User has been blocked.', [
                  { text: 'OK', onPress: () => safeRouterBack() }
                ]);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to block user.');
            }
          }
        }
      ]
    );
  };

  return {
    followLoading,
    handleFollowToggle,
    handleMessage,
    handleLikePost,
    handleBlockUser,
  };
};
