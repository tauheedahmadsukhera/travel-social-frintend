/**
 * Group Chat Database Schema & Utilities
 * Firestore structure for group conversations
 */

import { apiService } from '@/src/services/apiService';

/**
 * Firestore Collection Structure:
 * 
 * /groupChats/{groupId}
 *   - name: string
 *   - description: string
 *   - avatar: string
 *   - members: string[] (user IDs)
 *   - admins: string[] (admin user IDs)
 *   - createdBy: string (creator user ID)
 *   - createdAt: timestamp
 *   - updatedAt: timestamp
 *   - lastMessage: string
 *   - lastMessageAt: timestamp
 *   - isPublic: boolean
 *   - maxMembers: number (0 = unlimited)
 *   - currentMemberCount: number
 *
 * /groupChats/{groupId}/messages/{messageId}
 *   - senderId: string
 *   - text: string
 *   - media?: { type: 'image'|'video'|'file', url: string, size: number }
 *   - reactions: { emoji: string, userIds: string[] }[]
 *   - createdAt: timestamp
 *   - editedAt?: timestamp
 *   - deletedAt?: timestamp
 *   - replyTo?: messageId
 *
 * /groupChats/{groupId}/members/{userId}
 *   - joinedAt: timestamp
 *   - role: 'member'|'moderator'|'admin'
 *   - isMuted: boolean
 *   - notifications: 'all'|'mentions'|'none'
 */

export interface GroupChat {
  id?: string;
  name: string;
  description: string;
  avatar?: string;
  members: string[];
  admins: string[];
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastMessage?: string;
  lastMessageAt?: Date;
  isPublic: boolean;
  maxMembers: number;
  currentMemberCount: number;
}

export interface GroupMessage {
  id?: string;
  senderId: string;
  text: string;
  media?: {
    type: 'image' | 'video' | 'file';
    url: string;
    size: number;
  };
  reactions?: { emoji: string; userIds: string[] }[];
  createdAt?: Date;
  editedAt?: Date;
  deletedAt?: Date;
  replyTo?: string;
}

export interface GroupMember {
  userId: string;
  joinedAt?: Date;
  role: 'member' | 'moderator' | 'admin';
  isMuted: boolean;
  notifications: 'all' | 'mentions' | 'none';
}

/**
 * Create a new group chat
 */
export async function createGroupChat(
  creatorId: string,
  groupData: Partial<GroupChat>
): Promise<string> {
  const res = await apiService.post('/group-chats', { creatorId, ...groupData });
  return res?.id || res?._id || '';
}

/**
 * Add member to group
 */
export async function addGroupMember(
  groupId: string,
  userId: string,
  role: 'member' | 'moderator' | 'admin' = 'member'
): Promise<boolean> {
  await apiService.post(`/group-chats/${groupId}/members`, { userId, role });
  return true;
}

/**
 * Remove member from group
 */
export async function removeGroupMember(
  groupId: string,
  userId: string
): Promise<boolean> {
  await apiService.delete(`/group-chats/${groupId}/members/${userId}`);
  return true;
}

/**
 * Promote member to admin/moderator
 */
export async function promoteGroupMember(
  groupId: string,
  userId: string,
  role: 'admin' | 'moderator'
): Promise<boolean> {
  await apiService.post(`/group-chats/${groupId}/members/${userId}/role`, { role });
  return true;
}

/**
 * Send message to group
 */
export async function sendGroupMessage(
  groupId: string,
  message: GroupMessage
): Promise<string> {
  const res = await apiService.post(`/group-chats/${groupId}/messages`, message);
  return res?.id || res?._id || '';
}

/**
 * Get group chat by ID
 */
export async function getGroupChat(groupId: string): Promise<GroupChat | null> {
  const res = await apiService.get(`/group-chats/${groupId}`);
  return res ? ({ ...res, id: res.id || res._id }) : null;
}

/**
 * Get all groups for a user
 */
export async function getUserGroupChats(userId: string): Promise<GroupChat[]> {
  const res = await apiService.get(`/group-chats`, { member: userId });
  return Array.isArray(res) ? res : [];
}

/**
 * Get group messages with pagination
 */
export async function getGroupMessages(
  groupId: string,
  pageLimit: number = 50,
  startAfter?: string
): Promise<GroupMessage[]> {
  const res = await apiService.get(`/group-chats/${groupId}/messages`, { limit: pageLimit, startAfter });
  return Array.isArray(res) ? res : [];
}

/**
 * Mute/Unmute notifications for group
 */
export async function muteGroupNotifications(
  groupId: string,
  userId: string,
  mute: boolean
): Promise<boolean> {
  await apiService.post(`/group-chats/${groupId}/members/${userId}/mute`, { mute });
  return true;
}

/**
 * Delete group (admin only)
 */
export async function deleteGroupChat(
  groupId: string,
  userId: string
): Promise<boolean> {
  await apiService.delete(`/group-chats/${groupId}`, { data: { userId } });
  return true;
}

export default {
  createGroupChat,
  addGroupMember,
  removeGroupMember,
  promoteGroupMember,
  sendGroupMessage,
  getGroupChat,
  getUserGroupChats,
  getGroupMessages,
  muteGroupNotifications,
  deleteGroupChat,
};
