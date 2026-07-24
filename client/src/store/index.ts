/**
 * src/store/index.ts — Central barrel export for the app store.
 *
 * Primary Industrial Path:
 *   import { useAppStore } from '@/src/store';
 * Alias path:
 *   import { useAppStore } from '@/store';
 */
export { useAppStore } from './useAppStore';
export type { AppState } from './useAppStore';
export type { AuthSlice } from './slices/authSlice';
export type { MessagingSlice } from './slices/messagingSlice';
export type { UISlice } from './slices/uiSlice';
