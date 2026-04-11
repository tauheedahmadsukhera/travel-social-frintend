/**
 * ZeegoCloud Streaming Service
 * Using @zegocloud/zego-uikit-prebuilt-live-streaming-rn
 */

import { ZEEGOCLOUD_CONFIG, generateRoomId } from '../../config/zeegocloud';
import { IStreamingService } from '../interfaces/IStreamingService';

export class ZeegocloudStreamingService implements IStreamingService {
  private static instance: ZeegocloudStreamingService;
  private roomId: string = '';
  private userId: string = '';
  private userName: string = '';
  private isHost: boolean = false;
  private eventHandlers: Map<string, Function[]> = new Map();
  private initialized = false;
  private audioMuted = false;
  private videoEnabled = true;

  private constructor() {
    this.initializeEventHandlers();
  }

  public static getInstance(): ZeegocloudStreamingService {
    if (!ZeegocloudStreamingService.instance) {
      ZeegocloudStreamingService.instance = new ZeegocloudStreamingService();
    }
    return ZeegocloudStreamingService.instance;
  }

  private initializeEventHandlers() {
    const events = ['onConnected', 'onDisconnected', 'onUserJoined', 'onUserLeft', 'onStreamStarted', 'onStreamEnded', 'onError'];
    events.forEach(event => this.eventHandlers.set(event, []));
  }

  public on(event: string, callback: Function) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event)?.push(callback);
    }
  }

  public off(event: string, callback: Function) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event) || [];
      const index = handlers.indexOf(callback);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`❌ Error in ${event} handler:`, error);
      }
    });
  }

  public async initialize(userId?: string, roomId?: string, userName?: string, isHost: boolean = false): Promise<void> {
    try {
      const resolvedUserId = userId || this.userId || 'system';
      this.userId = resolvedUserId;
      this.roomId = roomId || this.roomId || generateRoomId(resolvedUserId);
      this.userName = userName || this.userName || `User_${resolvedUserId}`;
      this.isHost = isHost;
      this.initialized = true;

      console.log('✅ ZeegoCloud initialized:', { roomId: this.roomId, userId: this.userId, appID: ZEEGOCLOUD_CONFIG.appID });
      setTimeout(() => this.emit('onConnected', { roomId: this.roomId }), 100);
    } catch (error) {
      console.error('❌ Initialization error:', error);
      this.emit('onError', { code: 'INIT_ERROR', message: String(error) });
      throw error;
    }
  }

  public async createChannel(userId: string): Promise<string> {
    this.userId = userId;
    this.roomId = generateRoomId(userId);
    this.initialized = true;
    return this.roomId;
  }

  public async joinChannel(channelName: string, userId: string, isHost: boolean): Promise<void> {
    await this.initialize(userId, channelName, undefined, isHost);
  }

  public async leaveChannel(): Promise<void> {
    await this.leaveStream();
  }

  public async getToken(_channelName: string, _userId: string, _isHost?: boolean): Promise<string> {
    return '';
  }

  public async muteAudio(): Promise<void> {
    this.audioMuted = true;
  }

  public async unmuteAudio(): Promise<void> {
    this.audioMuted = false;
  }

  public isAudioMuted(): boolean {
    return this.audioMuted;
  }

  public async enableVideo(): Promise<void> {
    this.videoEnabled = true;
  }

  public async disableVideo(): Promise<void> {
    this.videoEnabled = false;
  }

  public async switchCamera(): Promise<void> {}

  public isVideoEnabled(): boolean {
    return this.videoEnabled;
  }

  public async setVideoQuality(_quality: 'low' | 'medium' | 'high'): Promise<void> {}

  public async setVideoConfig(_config: { width: number; height: number; frameRate: number; bitrate: number }): Promise<void> {}

  public onUserJoined(callback: (userId: string) => void): void {
    this.on('onUserJoined', (payload: any) => callback(String(payload?.userId || '')));
  }

  public onUserLeft(callback: (userId: string) => void): void {
    this.on('onUserLeft', (payload: any) => callback(String(payload?.userId || '')));
  }

  public onConnectionStateChanged(callback: (state: string) => void): void {
    this.on('onConnected', () => callback('connected'));
    this.on('onDisconnected', () => callback('disconnected'));
  }

  public onError(callback: (error: Error) => void): void {
    this.on('onError', (payload: any) => callback(new Error(payload?.message || 'Streaming error')));
  }

  public getAppId(): string {
    return String(ZEEGOCLOUD_CONFIG.appID || '');
  }

  public async startBroadcast(): Promise<boolean> {
    try {
      console.log('🎬 Starting broadcast...');
      this.emit('onStreamStarted', { roomId: this.roomId });
      return true;
    } catch (error) {
      console.error('❌ Broadcast error:', error);
      return false;
    }
  }

  public async stopBroadcast(): Promise<boolean> {
    try {
      console.log('⏹️ Stopping broadcast...');
      this.emit('onStreamEnded', { roomId: this.roomId });
      return true;
    } catch (error) {
      return false;
    }
  }

  public async joinAsViewer(): Promise<boolean> {
    try {
      this.emit('onUserJoined', { userId: this.userId });
      return true;
    } catch (error) {
      return false;
    }
  }

  public async leaveStream(): Promise<void> {
    try {
      this.emit('onUserLeft', { userId: this.userId });
      this.emit('onDisconnected', {});
      this.initialized = false;
      this.roomId = '';
      this.userId = '';
    } catch (error) {
      console.error('❌ Leave error:', error);
    }
  }

  public getRoomId(): string {
    return this.roomId;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getConfig() {
    return {
      appID: ZEEGOCLOUD_CONFIG.appID,
      appSign: ZEEGOCLOUD_CONFIG.appSign,
      roomID: this.roomId,
      userID: this.userId,
      userName: this.userName,
      isHost: this.isHost,
    };
  }

  public isConnected(): boolean {
    return this.roomId !== '';
  }

  public getProvider(): 'custom' {
    return 'custom';
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async disconnect(): Promise<void> {
    await this.leaveStream();
  }

  public async destroy(): Promise<void> {
    await this.leaveStream();
  }
}

export default ZeegocloudStreamingService;
