import { StateCreator } from 'zustand';

export interface MessagingSlice {
  messageCache: Record<string, any[]>;
  convoMap: Record<string, string>;
  setCachedMessages: (convoId: string, messages: any[]) => void;
  setConvoMapping: (otherUserId: string, convoId: string) => void;
  clearMessaging: () => void;
}

export const createMessagingSlice: StateCreator<
  MessagingSlice,
  [],
  [],
  MessagingSlice
> = (set) => ({
  messageCache: {},
  convoMap: {},

  setCachedMessages: (convoId, messages) =>
    set((state) => ({
      messageCache: {
        ...state.messageCache,
        [convoId]: messages.slice(0, 30),
      },
    })),

  setConvoMapping: (otherUserId, convoId) =>
    set((state) => ({
      convoMap: { ...state.convoMap, [otherUserId]: convoId },
    })),

  clearMessaging: () => set({ messageCache: {}, convoMap: {} }),
});
