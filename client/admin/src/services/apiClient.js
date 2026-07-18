import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export const API_BASE =
  process.env.REACT_APP_API_BASE_URL || 'https://travel-social-backend.onrender.com/api';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000
});

// Add token to headers
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
apiClient.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    throw err;
  }
);

export default apiClient;
