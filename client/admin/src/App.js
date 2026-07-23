import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { adminAPI } from './services/adminService';

// Components
import Sidebar from './components/Sidebar';

// Lazy Loaded Pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Management = lazy(() => import('./pages/Management'));
const Login = lazy(() => import('./pages/Login'));
const AdminLogs = lazy(() => import('./pages/AdminLogs'));
const Settings = lazy(() => import('./pages/Settings'));
const PostModeration = lazy(() => import('./pages/PostModeration'));
const Broadcast = lazy(() => import('./pages/Broadcast'));
const CommentModeration = lazy(() => import('./pages/CommentModeration'));
const StoryModeration = lazy(() => import('./pages/StoryModeration'));
const StreamsManagement = lazy(() => import('./pages/StreamsManagement'));
const VerificationRequests = lazy(() => import('./pages/VerificationRequests'));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [status, setStatus] = useState(token ? 'checking' : 'unauthenticated');

  useEffect(() => {
    let cancelled = false;
    async function verifySession() {
      if (!token) {
        setStatus('unauthenticated');
        return;
      }
      try {
        // Server-side proof of admin access (not just token presence)
        const res = await adminAPI.getDashboardAnalytics();
        if (cancelled) return;
        if (res === undefined || res === null) {
          logout();
          setStatus('unauthenticated');
          return;
        }
        if (user && user.role && user.role !== 'admin') {
          logout();
          setStatus('unauthenticated');
          return;
        }
        setStatus('authenticated');
      } catch (err) {
        if (cancelled) return;
        logout();
        setStatus('unauthenticated');
      }
    }
    verifySession();
    return () => { cancelled = true; };
  }, [token, logout, user]);

  if (status === 'checking') {
    return <PageLoader />;
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 min-h-screen">
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </main>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-bgDark">
        <Toaster position="top-right" reverseOrder={false} />
        <Routes>
          <Route path="/login" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/management" element={<ProtectedRoute><Management /></ProtectedRoute>} />
          <Route path="/posts" element={<ProtectedRoute><PostModeration /></ProtectedRoute>} />
          <Route path="/comments" element={<ProtectedRoute><CommentModeration /></ProtectedRoute>} />
          <Route path="/stories" element={<ProtectedRoute><StoryModeration /></ProtectedRoute>} />
          <Route path="/streams" element={<ProtectedRoute><StreamsManagement /></ProtectedRoute>} />
          <Route path="/verifications" element={<ProtectedRoute><VerificationRequests /></ProtectedRoute>} />
          <Route path="/broadcast" element={<ProtectedRoute><Broadcast /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute><AdminLogs /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
