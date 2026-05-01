import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlineDotsVertical, HiOutlineSearch, HiOutlineUserAdd, HiOutlineUserGroup } from 'react-icons/hi';
import { format } from 'date-fns';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0 });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getUsers(1, 100);
      if (res.success) {
        setUsers(res.data);
        // Basic stats calculation for UI
        const active = res.data.filter(u => u.status !== 'suspended').length;
        setStats({
          total: res.data.length,
          active,
          suspended: res.data.length - active
        });
      }
    } catch (err) {
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusToggle = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await (newStatus === 'active' ? adminAPI.unbanUser(userId) : adminAPI.banUser(userId));
      if (res.success) {
        toast.success(`User ${newStatus === 'active' ? 'unbanned' : 'suspended'}`);
        fetchUsers();
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await adminAPI.updateUserRole(userId, newRole);
      if (res.success) {
        toast.success(`Role updated to ${newRole}`);
        fetchUsers();
      }
    } catch (err) {
      toast.error('Failed to update role');
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">User Management</h2>
          <p className="text-slate-400">Manage traveler accounts, roles, and status.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <HiOutlineSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search travelers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 transition-all w-64 text-white"
            />
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all">
            <HiOutlineUserAdd /> Add Admin
          </button>
        </div>
      </header>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-6">
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-1">Total Travelers</p>
          <p className="text-4xl font-black text-white">{stats.total}</p>
        </div>
        <div className="glass p-6">
          <p className="text-indigo-400 text-sm font-bold uppercase tracking-widest mb-1">Active Now</p>
          <p className="text-4xl font-black text-white">{stats.active}</p>
        </div>
        <div className="glass p-6 border-l-4 border-red-500/50">
          <p className="text-red-400 text-sm font-bold uppercase tracking-widest mb-1">Suspended</p>
          <p className="text-4xl font-black text-white">{stats.suspended}</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="glass overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Traveler</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Joined</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i} className="animate-pulse">
                  <td colSpan="5" className="px-6 py-8"><div className="h-4 bg-white/5 rounded w-full" /></td>
                </tr>
              ))
            ) : filteredUsers.map((user) => (
              <tr key={user._id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={user.avatar || 'https://via.placeholder.com/40'} 
                      alt="" 
                      className="w-10 h-10 rounded-full bg-slate-800 border border-white/10"
                    />
                    <div>
                      <p className="text-white font-bold">{user.displayName || 'Unnamed Traveler'}</p>
                      <p className="text-slate-500 text-xs">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <select 
                    value={user.role || 'user'}
                    onChange={(e) => handleRoleChange(user._id, e.target.value)}
                    className="bg-transparent text-slate-300 outline-none border border-white/10 rounded-lg px-2 py-1 text-sm focus:border-indigo-500"
                  >
                    <option value="user">Traveler</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                    user.status === 'suspended' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                  }`}>
                    {user.status || 'active'}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 text-sm">
                  {user.createdAt ? format(new Date(user.createdAt), 'MMM dd, yyyy') : 'N/A'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleStatusToggle(user._id, user.status)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        user.status === 'suspended' 
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                    >
                      {user.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                    </button>
                    <button className="p-2 text-slate-500 hover:text-white rounded-lg transition-all">
                      <HiOutlineDotsVertical />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {!loading && filteredUsers.length === 0 && (
          <div className="p-20 text-center text-slate-500 italic">
            No travelers found matching "{search}"
          </div>
        )}
      </div>
    </div>
  );
};

export default Users;
