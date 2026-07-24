import { ConnectionState, ILiveStreamService, StreamError, StreamSession, VideoQuality, Viewer } from '../interfaces/ILiveStreamService';

// Fallback adapter to keep older service-factory based flows from crashing.
// Current production streaming uses ZeegoCloud in newer screens.
export class AgoraLiveStreamService implements ILiveStreamService {
  private connected = false;
  private currentChannel = '';
  private currentUserId = '';
  private onViewerJoinedCallback?: (viewer: Viewer) => void;
  private onViewerLeftCallback?: (viewerId: string) => void;
  private onConnectionChangedCallback?: (state: ConnectionState) => void;
  private onErrorCallback?: (error: StreamError) => void;

  async initialize(_appId: string): Promise<void> {
    this.connected = false;
  }

  async createStream(channelName: string, userId: string): Promise<StreamSession> {
    this.currentChannel = channelName;
    this.currentUserId = userId;
    this.connected = true;
    this.onConnectionChangedCallback?.(ConnectionState.CONNECTED);
    return {
      channelName,
      token: '',
      uid: Number(String(userId).replace(/\D/g, '').slice(0, 9) || '0'),
    };
  }

  async joinStream(channelName: string, userId: string): Promise<StreamSession> {
    const session = await this.createStream(channelName, userId);
    this.onViewerJoinedCallback?.({
      uid: userId,
      name: `User_${userId}`,
      joinedAt: new Date(),
    });
    return session;
  }

  async leaveStream(): Promise<void> {
    if (this.currentUserId) {
      this.onViewerLeftCallback?.(this.currentUserId);
    }
    this.connected = false;
    this.currentChannel = '';
    this.currentUserId = '';
    this.onConnectionChangedCallback?.(ConnectionState.DISCONNECTED);
  }

  async switchCamera(): Promise<void> {}

  async enableCamera(_enabled: boolean): Promise<void> {}

  async enableMicrophone(_enabled: boolean): Promise<void> {}

  async enableDualCamera(_enabled: boolean): Promise<void> {}

  async switchPrimaryCamera(): Promise<void> {}

  async setVideoQuality(_quality: VideoQuality): Promise<void> {}

  async getViewers(): Promise<Viewer[]> {
    return this.currentUserId
      ? [{ uid: this.currentUserId, name: `User_${this.currentUserId}`, joinedAt: new Date() }]
      : [];
  }

  onViewerJoined(callback: (viewer: Viewer) => void): void {
    this.onViewerJoinedCallback = callback;
  }

  onViewerLeft(callback: (viewerId: string) => void): void {
    this.onViewerLeftCallback = callback;
  }

  onConnectionStateChanged(callback: (state: ConnectionState) => void): void {
    this.onConnectionChangedCallback = callback;
  }

  onError(callback: (error: StreamError) => void): void {
    this.onErrorCallback = callback;
  }

  async destroy(): Promise<void> {
    await this.leaveStream();
  }
}

