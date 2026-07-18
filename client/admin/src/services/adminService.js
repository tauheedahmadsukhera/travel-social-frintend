import apiClient from './apiClient';

export const adminAPI = {
  // Users
  getUsers: (page = 1, limit = 20, search = '', role = '', status = '') =>
    apiClient.get('/admin/users', { params: { page, limit, search, role, status } }),

  getUserDetails: (uid) =>
    apiClient.get(`/admin/users/${uid}`),

  banUser: (uid, reason = '') =>
    apiClient.post(`/admin/users/${uid}/ban`, { reason }),

  unbanUser: (uid) =>
    apiClient.post(`/admin/users/${uid}/unban`),

  updateUserRole: (uid, role) =>
    apiClient.post(`/admin/users/${uid}/role`, { role }),

  deleteUser: (uid) =>
    apiClient.delete(`/admin/users/${uid}`),

  // Analytics
  getDashboardAnalytics: () =>
    apiClient.get('/admin/stats'),

  // Activity
  getRecentActivity: () =>
    apiClient.get('/admin/logs', { params: { limit: 10 } }),

  // Categories
  getCategories: () =>
    apiClient.get('/admin/categories'),
  
  addCategory: (formData) =>
    apiClient.post('/admin/categories', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  
  deleteCategory: (id) =>
    apiClient.delete(`/admin/categories/${id}`),

  // Regions
  getRegions: () =>
    apiClient.get('/admin/regions'),
  
  addRegion: (formData) =>
    apiClient.post('/admin/regions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  
  deleteRegion: (id) =>
    apiClient.delete(`/admin/regions/${id}`),

  // Logs
  getAdminLogs: (page = 1, limit = 50, adminId = '', action = '') =>
    apiClient.get('/admin/logs', { params: { page, limit, adminId, action } }),

  // Reports
  getReports: (page = 1, limit = 50, status = 'pending') =>
    apiClient.get('/admin/reports', { params: { page, limit, status } }),
  
  resolveReport: (reportId, status, note = '') =>
    apiClient.post(`/admin/reports/${reportId}/resolve`, { status, note }),

  // Broadcast Notification
  broadcastNotification: (title, message, type = 'announcement') =>
    apiClient.post('/admin/broadcast', { title, message, type }),

  // Post Moderation
  getPosts: (page = 1, limit = 20, search = '', flagged = false) =>
    apiClient.get('/admin/posts', { params: { page, limit, search, flagged } }),

  deletePost: (postId) =>
    apiClient.delete(`/admin/posts/${postId}`),

  // User Verification
  toggleUserVerification: (uid, isVerified) =>
    apiClient.post(`/admin/users/${uid}/verify`, { isVerified }),

  // Comment Moderation
  getComments: (page = 1, limit = 20, search = '') =>
    apiClient.get('/admin/comments', { params: { page, limit, search } }),

  deleteComment: (id) =>
    apiClient.delete(`/admin/comments/${id}`),

  // Story Moderation
  getStories: (page = 1, limit = 20) =>
    apiClient.get('/admin/stories', { params: { page, limit } }),

  deleteStory: (id) =>
    apiClient.delete(`/admin/stories/${id}`),

  // Live Streams Management
  getStreams: (page = 1, limit = 20) =>
    apiClient.get('/admin/streams', { params: { page, limit } }),

  endStream: (id) =>
    apiClient.post(`/admin/streams/${id}/end`),

  // Verification Requests
  getVerificationRequests: (page = 1, limit = 20, status = 'pending') =>
    apiClient.get('/admin/verification-requests', { params: { page, limit, status } }),

  updateVerificationRequestStatus: (id, status, rejectionReason = '') =>
    apiClient.put(`/admin/verification-requests/${id}`, { status, rejectionReason }),
};

