// @ts-ignore - fbemitter types not available
import { EventEmitter } from 'fbemitter';

// Event types
export type FeedEventType =
  | 'POST_DELETED'
  | 'POST_CREATED'
  | 'POST_UPDATED'
  | 'HIGHLIGHT_DELETED'
  | 'USER_PRIVACY_CHANGED'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED';

export interface FeedEvent {
  type: FeedEventType;
  postId?: string;
  highlightId?: string;
  userId?: string;
  data?: any;
}

class FeedEventEmitter extends EventEmitter {
  private static instance: FeedEventEmitter;

  private constructor() {
    super();
    // this.setMaxListeners(50); // Not supported in fbemitter
  }

  static getInstance(): FeedEventEmitter {
    if (!FeedEventEmitter.instance) {
      FeedEventEmitter.instance = new FeedEventEmitter();
    }
    return FeedEventEmitter.instance;
  }

  // Emit feed update event
  emitFeedUpdate(event: FeedEvent) {
    console.log('📢 Feed event emitted:', event.type, event);
    // @ts-ignore - EventEmitter methods
    this.emit('feedUpdate', event);
  }

  // Subscribe to feed updates
  onFeedUpdate(callback: (event: FeedEvent) => void) {
    // @ts-ignore - EventEmitter methods
    const subscription = this.addListener('feedUpdate', callback);
    return () => subscription.remove();
  }

  // Specific event emitters
  emitPostDeleted(postId: string) {
    this.emitFeedUpdate({ type: 'POST_DELETED', postId });
  }

  emitPostCreated(postId: string, data?: any) {
    this.emitFeedUpdate({ type: 'POST_CREATED', postId, data });
  }

  emitPostUpdated(postId: string, data?: any) {
    this.emitFeedUpdate({ type: 'POST_UPDATED', postId, data });
  }

  emitHighlightDeleted(highlightId: string) {
    this.emitFeedUpdate({ type: 'HIGHLIGHT_DELETED', highlightId });
  }

  // Listen to specific post updates
  onPostUpdated(postId: string, callback: (postId: string, data: any) => void) {
    // @ts-ignore - EventEmitter methods
    const subscription = this.addListener('feedUpdate', (event: FeedEvent) => {
      if (event.type === 'POST_UPDATED' && event.postId === postId) {
        callback(postId, event.data);
      }
    });
    return subscription;
  }

  // Unsubscribe from specific post updates
  offPostUpdated(postId: string, callback: any) {
    // fbemitter subscription objects have a remove() method
    if (callback && typeof callback.remove === 'function') {
      callback.remove();
    }
  }

  emitUserPrivacyChanged(userId: string, isPrivate: boolean) {
    this.emitFeedUpdate({ type: 'USER_PRIVACY_CHANGED', userId, data: { isPrivate } });
  }

  emitUserBlocked(userId: string) {
    this.emitFeedUpdate({ type: 'USER_BLOCKED', userId });
  }

  emitUserUnblocked(userId: string) {
    this.emitFeedUpdate({ type: 'USER_UNBLOCKED', userId });
  }
}

export const feedEventEmitter = FeedEventEmitter.getInstance();

