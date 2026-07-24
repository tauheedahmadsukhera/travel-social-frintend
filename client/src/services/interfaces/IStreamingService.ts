/**
 * Streaming Service Interface
 * Abstract interface for live video streaming
 * Implement this to swap Agora with Twilio, AWS IVS, etc.
 */

export interface IStreamingService {
  // ==================== INITIALIZATION ====================
  /**
   * Initialize the streaming service
   */
  initialize(): Promise<void>;

  /**
   * Cleanup and release resources
   */
  destroy(): Promise<void>;

  // ==================== CHANNEL MANAGEMENT ====================
  /**
   * Create a new streaming channel
   * @returns Channel name/ID
   */
  createChannel(userId: string): Promise<string>;

  /**
   * Join an existing channel
   */
  joinChannel(channelName: string, userId: string, isHost: boolean): Promise<void>;

  /**
   * Leave the current channel
   */
  leaveChannel(): Promise<void>;

  // ==================== TOKEN MANAGEMENT ====================
  /**
   * Get authentication token for joining a channel
   */
  getToken(channelName: string, userId: string, isHost?: boolean): Promise<string>;

  // ==================== AUDIO CONTROLS ====================
  /**
   * Mute local audio
   */
  muteAudio(): Promise<void>;

  /**
   * Unmute local audio
   */
  unmuteAudio(): Promise<void>;

  /**
   * Check if audio is muted
   */
  isAudioMuted(): boolean;

  // ==================== VIDEO CONTROLS ====================
  /**
   * Enable local video
   */
  enableVideo(): Promise<void>;

  /**
   * Disable local video
   */
  disableVideo(): Promise<void>;

  /**
   * Switch between front and back camera
   */
  switchCamera(): Promise<void>;

  /**
   * Check if video is enabled
   */
  isVideoEnabled(): boolean;

  // ==================== STREAM QUALITY ====================
  /**
   * Set video quality/resolution
   */
  setVideoQuality(quality: 'low' | 'medium' | 'high'): Promise<void>;

  /**
   * Set video encoding configuration
   */
  setVideoConfig(config: {
    width: number;
    height: number;
    frameRate: number;
    bitrate: number;
  }): Promise<void>;

  // ==================== EVENT LISTENERS ====================
  /**
   * Listen for remote user joining
   */
  onUserJoined(callback: (userId: string) => void): void;

  /**
   * Listen for remote user leaving
   */
  onUserLeft(callback: (userId: string) => void): void;

  /**
   * Listen for connection state changes
   */
  onConnectionStateChanged(callback: (state: string) => void): void;

  /**
   * Listen for errors
   */
  onError(callback: (error: Error) => void): void;

  // ==================== CONFIGURATION ====================
  /**
   * Get the app ID
   */
  getAppId(): string;

  /**
   * Get the current provider
   */
  getProvider(): 'agora' | 'twilio' | 'aws-ivs' | 'custom';

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean;
}
