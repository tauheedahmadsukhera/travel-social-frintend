import { create } from 'zustand';

// Store token in sessionStorage so closing browser invalidates session and prevents persistent XSS token extraction
const storedUser = (() => {
  try {
    const raw = sessionStorage.getItem('adminUser') || localStorage.getItem('adminUser');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
})();

export const useAuthStore = create((set) => ({
  user: storedUser,
  token: sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || null,
  isAuthenticated: !!(sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken')),

  setAuth: (user, token) => {
    sessionStorage.setItem('adminToken', token);
    sessionStorage.setItem('adminUser', JSON.stringify(user));
    // Clean up legacy localStorage if present
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    set({ user: null, token: null, isAuthenticated: false });
  }
}));

