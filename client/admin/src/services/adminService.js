import apiClient from './apiClient';

export const adminAPI = {
  // Users
  getAllUsers: (page = 1, limit = 20, search = '', role = '', status = '') =>
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
    apiClient.get('/admin/activity'),

  // Categories
  getCategories: () =>
    apiClient.get('/admin/categories'),
  
  addCategory: (data) =>
    apiClient.post('/admin/categories', data),
  
  deleteCategory: (id) =>
    apiClient.delete(`/admin/categories/${id}`),

  // Regions
  getRegions: () =>
    apiClient.get('/admin/regions'),
  
  addRegion: (data) =>
    apiClient.post('/admin/regions', data),
  
  deleteRegion: (id) =>
    apiClient.delete(`/admin/regions/${id}`),

  // Logs
  getAdminLogs: (page = 1, limit = 50, adminId = '', action = '') =>
    apiClient.get('/admin/logs', { params: { page, limit, adminId, action } })
};
