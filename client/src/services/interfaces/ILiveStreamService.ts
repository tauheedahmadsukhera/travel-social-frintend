/**
 * Live Stream Service Interface
 * Implement this interface to switch between Agora, Twilio, AWS IVS, etc.
 */

export interface ILiveStreamService {
  // Initialize
  initialize(appId: string): Promise<void>;
  
  // Create/Join stream
  createStream(channelName: string, userId: string): Promise<StreamSession>;
  joinStream(channelName: string, userId: string): Promise<StreamSession>;
  
  // Leave stream
  leaveStream(): Promise<void>;
  
  // Camera controls
  switchCamera(): Promise<void>;
  enableCamera(enabled: boolean): Promise<void>;
  enableMicrophone(enabled: boolean): Promise<void>;
  
  // Dual camera (Picture-in-Picture)
  enableDualCamera(enabled: boolean): Promise<void>;
  switchPrimaryCamera(): Promise<void>; // Switch between front and back as primary
  
  // Stream quality
  setVideoQuality(quality: VideoQuality): Promise<void>;
  
  // Viewers
  getViewers(): Promise<Viewer[]>;
  onViewerJoined(callback: (viewer: Viewer) => void): void;
  onViewerLeft(callback: (viewerId: string) => void): void;
  
  // Events
  onConnectionStateChanged(callback: (state: ConnectionState) => void): void;
  onError(callback: (error: StreamError) => void): void;
  
  // Cleanup
  destroy(): Promise<void>;
}

export interface StreamSession {
  channelName: string;
  token: string;
  uid: number;
}

export interface Viewer {
  uid: string;
  name: string;
  avatar?: string;
  joinedAt: Date;
}

export enum VideoQuality {
  LOW = '240p',
  MEDIUM = '480p',
  HIGH = '720p',
  ULTRA = '1080p'
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

export interface StreamError {
  code: string;
  message: string;
}

