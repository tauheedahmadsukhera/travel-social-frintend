import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { useEffect, useState } from 'react';
import { apiService } from '../_services/apiService';



function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}

export interface UserProfile {
  id: string;
  uid: string;
  name: string;
  displayName?: string;
  username?: string;
  avatar: string;
  photoURL?: string;
  bio?: string;
  email?: string;
  website?: string;
}

export function useUserProfile(userId: string | null | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPlaceholderName = (value: any) => {
    const s = typeof value === 'string' ? value.trim() : '';
    if (!s) return true;
    return s.toLowerCase() === 'user' || s.toLowerCase() === 'unknown';
  };

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setProfile(null);
      return;
    }

    let mounted = true;

    async function fetchProfile() {
      try {
        setLoading(true);
        setError(null);
        // Use backend API for user profile
        const result = await apiService.get(`/users/${userId}`);
        if (!mounted) return;
        // Robust unwrap: backend responses vary (data | user | nested data)
        const payload: any = (() => {
          if (!isRecord(result)) return null;
          const root = result;
          const d = (root as any).data;
          if (isRecord(d) && isRecord((d as any).data)) return (d as any).data;
          if (isRecord(d) && isRecord((d as any).user)) return (d as any).user;
          if (isRecord(d)) return d;
          if (isRecord((root as any).user)) return (root as any).user;
          return null;
        })();

        if (isRecord(result) && result.success && isRecord(payload)) {
          // Ensure avatar always has a value across all supported avatar fields
          const avatarUrl = payload.avatar || payload.photoURL || payload.profilePicture || DEFAULT_AVATAR_URL;
          const email = (typeof payload.email === 'string' ? payload.email.trim() : '') as string;
          const emailFallback = email && email.includes('@') ? email.split('@')[0] : email;
          const displayName = (typeof payload.displayName === 'string' ? payload.displayName.trim() : '') as string;
          const resolvedName =
            (!isPlaceholderName(displayName) ? displayName : '') ||
            (typeof payload.name === 'string' ? payload.name.trim() : '') ||
            (typeof payload.username === 'string' ? payload.username.trim() : '') ||
            (emailFallback ? emailFallback : '') ||
            (email ? email : '') ||
            'Unknown';
          setProfile({
            id: String(payload.id || payload._id || userId),
            uid: String(payload.uid || payload.firebaseUid || payload.id || payload._id || userId),
            avatar: avatarUrl,
            name: resolvedName,
            displayName: payload.displayName,
            username: payload.username,
            photoURL: payload.photoURL,
            bio: payload.bio,
            email: payload.email,
            website: payload.website,
          });
        } else {
          setError('Failed to load profile');
          setProfile(null);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('useUserProfile error:', err);
        setError('An error occurred');
        setProfile(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchProfile();
    return () => {
      mounted = false;
    };
  }, [userId]);

  return { profile, loading, error };
}
