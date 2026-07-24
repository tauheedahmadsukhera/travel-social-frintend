import { StateCreator } from 'zustand';

export interface UISlice {
  isOnline: boolean;
  setOnlineStatus: (status: boolean) => void;
}

export const createUISlice: StateCreator<
  UISlice,
  [],
  [],
  UISlice
> = (set) => ({
  isOnline: true,
  setOnlineStatus: (status) => set({ isOnline: status }),
});
