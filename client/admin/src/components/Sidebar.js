import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  HiOutlineViewGrid, 
  HiOutlineUsers, 
  HiOutlineExclamationCircle, 
  HiOutlineDocumentText, 
  HiOutlineCog,
  HiOutlineLogout,
  HiOutlinePhotograph,
  HiOutlineSpeakerphone,
  HiOutlineAdjustments
} from 'react-icons/hi';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

const menuItems = [
  { name: 'Dashboard', icon: <HiOutlineViewGrid />, path: '/' },
  { name: 'Users', icon: <HiOutlineUsers />, path: '/users' },
  { name: 'Post Moderation', icon: <HiOutlinePhotograph />, path: '/posts' },
  { name: 'Reports', icon: <HiOutlineExclamationCircle />, path: '/reports' },
  { name: 'App Management', icon: <HiOutlineAdjustments />, path: '/management' },
  { name: 'Broadcast', icon: <HiOutlineSpeakerphone />, path: '/broadcast' },
  { name: 'Admin Logs', icon: <HiOutlineDocumentText />, path: '/logs' },
  { name: 'Settings', icon: <HiOutlineCog />, path: '/settings' },
];

const Sidebar = () => {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <div className="w-64 h-screen glass border-r border-white/10 flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Admin<span className="text-indigo-400">Hub</span></h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Trips Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `
              flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200
              ${isActive 
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white'}
            `}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium text-sm">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-4 px-4 py-3 w-full text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
        >
          <HiOutlineLogout className="text-xl" />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
