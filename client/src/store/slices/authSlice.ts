import { StateCreator } from 'zustand';

export interface AuthSlice {
  userId: string | null;
  userProfile: any | null;
  setUserId: (id: string | null) => void;
  setUserProfile: (profile: any | null) => void;
  logout: () => void;
}

export const createAuthSlice: StateCreator<
  AuthSlice,
  [],
  [],
  AuthSlice
> = (set) => ({
  userId: null,
  userProfile: null,

  setUserId: (id) => set({ userId: id }),
  setUserProfile: (profile) => set({ userProfile: profile }),

  logout: () =>
    set({
      userId: null,
      userProfile: null,
    }),
});
