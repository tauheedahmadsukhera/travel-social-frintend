import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/adminService';
import { format } from 'date-fns';
import { HiOutlineClock } from 'react-icons/hi';

const AdminLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getAdminLogs(1, 50);
      if (res.success) {
        setLogs(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  };

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
            ) : logs.map((log) => (
              <tr key={log._id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-500 font-bold text-xs">
                      A
                    </div>
                    <span className="text-white text-sm font-medium">{log.adminId?.email || 'System'}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold text-slate-300 uppercase">
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-400 text-sm">
                  {log.targetType}: {log.targetId}
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs flex items-center gap-2">
                  <HiOutlineClock />
                  {format(new Date(log.timestamp || log.createdAt), 'MMM dd, HH:mm:ss')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && logs.length === 0 && (
          <div className="p-20 text-center text-slate-500 italic">
            No audit logs found.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLogs;
