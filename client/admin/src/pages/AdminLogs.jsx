import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminAPI } from '../services/adminService';
import { format } from 'date-fns';
import { HiOutlineClock } from 'react-icons/hi';

const AdminLogs = () => {
  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: async () => {
      const res = await adminAPI.getAdminLogs(1, 50);
      if (!res.success) throw new Error('Failed to fetch logs');
      return res.data || [];
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const logs = data || [];

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h2 className="text-3xl font-black text-white">Admin Audit Logs</h2>
        <p className="text-slate-400">Track all administrative actions performed on the platform.</p>
      </header>

      <div className="glass overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Admin</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Action</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Target</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i} className="animate-pulse">
                  <td colSpan="4" className="px-6 py-6"><div className="h-4 bg-white/5 rounded w-full" /></td>
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-slate-500">
                  <HiOutlineClock className="mx-auto text-3xl mb-2 opacity-40" />
                  No admin logs yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log._id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm text-white font-medium">
                    {log.adminId?.displayName || log.adminId?.email || 'System'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {String(log.action || '').replace(/_/g, ' ')}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {log.targetType || '—'} {log.targetId ? `(${String(log.targetId).slice(0, 8)}…)` : ''}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {log.createdAt ? format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm') : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminLogs;
