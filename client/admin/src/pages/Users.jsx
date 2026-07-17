import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlineDotsVertical, HiOutlineSearch, HiOutlineUserAdd, HiOutlineChevronLeft, HiOutlineChevronRight, HiBadgeCheck } from 'react-icons/hi';
import { format } from 'date-fns';

const Users = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 10;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch users with React Query
  const { data, isLoading, isPreviousData } = useQuery({
    queryKey: ['users', page, debouncedSearch],
    queryFn: async () => {
      const res = await adminAPI.getUsers(page, limit, debouncedSearch);
      if (!res.success) throw new Error('Failed to fetch users');
      return res;
    },
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // Cache for 5 mins
  });

  const users = data?.data || [];
  const totalUsers = data?.total || 0;
  const totalPages = Math.ceil(totalUsers / limit);

  // Mutations for optimistic updates
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, newStatus }) => {
      return newStatus === 'active' ? adminAPI.unbanUser(userId) : adminAPI.banUser(userId);
    },
    onSuccess: (res, variables) => {
      toast.success(`User ${variables.newStatus === 'active' ? 'unbanned' : 'suspended'}`);
      queryClient.invalidateQueries(['users']);
    },
    onError: () => toast.error('Failed to update status')
  });

  const roleChangeMutation = useMutation({
    mutationFn: async ({ userId, newRole }) => adminAPI.updateUserRole(userId, newRole),
    onSuccess: (res, variables) => {
      toast.success(`Role updated to ${variables.newRole}`);
      queryClient.invalidateQueries(['users']);
    },
    onError: () => toast.error('Failed to update role')
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => adminAPI.deleteUser(userId),
    onSuccess: () => {
      toast.success('User deleted permanently');
      queryClient.invalidateQueries(['users']);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to delete user')
  });

  const handleDeleteUser = (user) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${user.displayName || user.email}"? This will also delete all their posts.`)) return;
    deleteUserMutation.mutate(user._id);
  };

  const toggleVerifyMutation = useMutation({
    mutationFn: async ({ userId, isVerified }) => adminAPI.toggleUserVerification(userId, isVerified),
    onSuccess: (res, variables) => {
      toast.success(variables.isVerified ? 'User verified successfully' : 'Verification badge removed');
      queryClient.invalidateQueries(['users']);
    },
    onError: () => toast.error('Failed to update verification status')
  });

  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-full">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">User Management</h2>
          <p className="text-slate-400">Manage traveler accounts, roles, and status (Server Pagination).</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <HiOutlineSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search database..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 transition-all w-64 text-white"
            />
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20">
            <HiOutlineUserAdd /> Add Admin
          </button>
        </div>
      </header>

      {/* Users Table */}
      <div className="glass overflow-hidden flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
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
              {isLoading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan="5" className="px-6 py-8"><div className="h-4 bg-white/5 rounded w-full" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="p-20 text-center text-slate-500 italic">
                      No travelers found matching "{search}"
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img 
                            src={user.avatar} 
                            alt="" 
                            className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 object-cover"
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                          />
                        ) : null}
                        <div 
                          className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-500 font-bold text-sm"
                          style={{ display: user.avatar ? 'none' : 'flex' }}
                        >
                          {(user.displayName || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <p className="text-white font-bold">{user.displayName || 'Unnamed Traveler'}</p>
                            {user.isVerified && (
                              <HiBadgeCheck className="text-blue-400 text-lg flex-shrink-0" title="Verified Traveler" />
                            )}
                          </div>
                          <p className="text-slate-500 text-xs">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={user.role || 'user'}
                        onChange={(e) => roleChangeMutation.mutate({ userId: user._id, newRole: e.target.value })}
                        disabled={roleChangeMutation.isLoading}
                        className="bg-transparent text-slate-300 outline-none border border-white/10 rounded-lg px-2 py-1 text-sm focus:border-indigo-500"
                      >
                        <option value="user" className="bg-bgDark">Traveler</option>
                        <option value="moderator" className="bg-bgDark">Moderator</option>
                        <option value="admin" className="bg-bgDark">Admin</option>
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
                            onClick={() => toggleVerifyMutation.mutate({ userId: user._id, isVerified: !user.isVerified })}
                            disabled={toggleVerifyMutation.isPending}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              user.isVerified
                                ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                                : 'bg-slate-500/20 text-slate-300 hover:bg-slate-500/30'
                            }`}
                          >
                            {user.isVerified ? 'Unverify' : 'Verify'}
                          </button>
                          <button 
                            onClick={() => toggleStatusMutation.mutate({ userId: user._id, newStatus: user.status === 'suspended' ? 'active' : 'suspended' })}
                            disabled={toggleStatusMutation.isPending}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              user.status === 'suspended' 
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                          >
                            {user.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleteUserMutation.isPending}
                            className="px-3 py-1 rounded-lg text-xs font-bold bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white transition-all"
                            title="Permanently delete user"
                          >
                            Delete
                          </button>
                        </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="p-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-sm">
          <div className="text-slate-400">
            Showing <span className="text-white font-bold">{users.length > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="text-white font-bold">{Math.min(page * limit, totalUsers)}</span> of <span className="text-white font-bold">{totalUsers}</span> entries
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setPage(old => Math.max(old - 1, 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <HiOutlineChevronLeft />
            </button>
            <span className="px-4 font-bold text-indigo-400">Page {page} of {totalPages || 1}</span>
            <button 
              onClick={() => {
                if (!isPreviousData && page < totalPages) setPage(old => old + 1);
              }}
              disabled={isPreviousData || page === totalPages || totalPages === 0}
              className="p-2 rounded-lg bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <HiOutlineChevronRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Users;
