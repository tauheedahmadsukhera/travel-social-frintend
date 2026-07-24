/**
 * useAppStore — Zustand store composed from feature slices.
 *
 * Primary Industrial Path:
 *   import { useAppStore } from '@/src/store/useAppStore';
 * Or alias:
 *   import { useAppStore } from '@/store/useAppStore';
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createMessagingSlice, MessagingSlice } from './slices/messagingSlice';
import { createUISlice, UISlice } from './slices/uiSlice';

// Combined type — all slices merged
export type AppState = AuthSlice & MessagingSlice & UISlice;

export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createAuthSlice(...a),
      ...createMessagingSlice(...a),
      ...createUISlice(...a),

      // Override logout to clear messaging state too
      logout: () => {
        const [set] = a;
        set({
          userId: null,
          userProfile: null,
          messageCache: {},
          convoMap: {},
        });
      },
    }),
    {
      name: 'trips-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        userId: state.userId,
        userProfile: state.userProfile,
        messageCache: state.messageCache,
        convoMap: state.convoMap,
      }),
    }
  )
);
