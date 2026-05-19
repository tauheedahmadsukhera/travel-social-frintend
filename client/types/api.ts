/**
 * API Types
 * Response shapes from the backend API endpoints.
 */

import { User, Post, Story, LocationData, Notification, Conversation, NormalizedMessage } from './models';

// Generic standard wrapper for all endpoints
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Auth Endpoints
export interface AuthResponse extends ApiResponse {
  data?: {
    token: string;
    user: User;
  };
}

// Posts Endpoints
export interface FeedResponse extends ApiResponse {
  data?: Post[];
  nextCursor?: string;
  hasMore?: boolean;
}

// User Profile Endpoints
export interface UserProfileResponse extends ApiResponse {
  data?: User & {
    posts: Post[];
    followers: string[];
    following: string[];
  };
}

// Search Endpoints
export interface SearchResponse extends ApiResponse {
  data?: {
    users: User[];
    locations: LocationData[];
    tags: string[];
  };
}

// Notification Endpoints
export interface NotificationsResponse extends ApiResponse {
  data?: Notification[];
  unreadCount?: number;
}

export interface BulkProfilesResponse extends ApiResponse {
  data?: User[];
}
