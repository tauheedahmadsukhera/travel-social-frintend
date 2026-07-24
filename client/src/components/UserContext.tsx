import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import storage from '@/lib/storage';
import { getAuthenticatedUserId } from '@/lib/currentUser';

export type AuthUser = {
  uid: string;
  id?: string;
  email?: string | null;
  displayName?: string | null;
  avatar?: string | null;
} | null;

const UserContext = createContext<{ user: AuthUser; loading: boolean; refresh: () => Promise<void> }>({
  user: null,
  loading: true,
  refresh: async () => {},
});

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const userId = await getAuthenticatedUserId();
      if (!userId) {
        setUser(null);
        return;
      }
      const [email, avatar, displayName] = await Promise.all([
        storage.getItem('userEmail'),
        storage.getItem('userAvatar'),
        storage.getItem('displayName'),
      ]);
      setUser({
        uid: userId,
        id: userId,
        email,
        avatar,
        displayName,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UserContext.Provider value={{ user, loading, refresh }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): AuthUser => {
  const context = useContext(UserContext);
  if (!context) {
    console.warn('[useUser] UserContext not found - returning null');
    return null;
  }
  return context.user;
};

export const useAuthLoading = (): boolean => {
  const context = useContext(UserContext);
  return context?.loading ?? false;
};

export const useRefreshUser = (): (() => Promise<void>) => {
  const context = useContext(UserContext);
  return context?.refresh ?? (async () => {});
};
