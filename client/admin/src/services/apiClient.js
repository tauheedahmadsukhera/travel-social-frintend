import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

let apiBaseUrl = process.env.REACT_APP_API_BASE_URL;

if (!apiBaseUrl) {
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ REACT_APP_API_BASE_URL is missing in environment variables!');
    throw new Error('REACT_APP_API_BASE_URL is not configured! Please set it in your .env file inside /client/admin/.');
  }
  apiBaseUrl = 'https://travel-social-backend.onrender.com/api';
}

export const API_BASE = apiBaseUrl;

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
