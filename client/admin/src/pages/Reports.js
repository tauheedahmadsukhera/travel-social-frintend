import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/adminService';
import { 
  HiOutlineCheckCircle, 
  HiOutlineXCircle, 
  HiOutlineClock
} from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');

  useEffect(() => {
    fetchReports();
  }, [statusFilter]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getReports(1, 50, statusFilter);
      if (res.success) {
        setReports(res.data);
      }
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id, status) => {
    try {
      const res = await adminAPI.resolveReport(id, status, 'Resolved by admin');
      if (res.success) {
        toast.success(`Report ${status}`);
        fetchReports();
      }
    } catch (err) {
      toast.error('Action failed');
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'resolved': return <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">Resolved</span>;
      case 'dismissed': return <span className="px-3 py-1 rounded-full bg-slate-500/20 text-slate-400 text-xs font-bold uppercase tracking-wider">Dismissed</span>;
      default: return <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-wider">Pending</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">Content Moderation</h2>
          <p className="text-slate-400">Review and manage reported content across the platform.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex bg-white/5 rounded-xl p-1">
            {['pending', 'resolved', 'dismissed'].map(s => (
              <button 
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="glass overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/[0.02] border-b border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <th className="px-6 py-4">Report Details</th>
              <th className="px-6 py-4">Target</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1,2,3].map(i => (
                <tr key={i} className="animate-pulse">
                  <td colSpan="5" className="px-6 py-8"><div className="h-4 bg-white/5 rounded w-full" /></td>
                </tr>
              ))
            ) : reports.map((report) => (
              <tr key={report._id} className="hover:bg-white/[0.01] transition-all group">
                <td className="px-6 py-4">
                  <p className="font-bold text-white">{report.reason}</p>
                  {report.details && <p className="text-slate-400 text-xs mt-1">{report.details}</p>}
                  <p className="text-[9px] text-slate-500 mt-2 uppercase tracking-widest font-mono">Reporter ID: {report.reporterId}</p>

                  {/* Inline Target Preview */}
                  {report.targetContent && (
                    <div className="mt-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs max-w-lg">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-2">Reported Content Preview:</p>
                      
                      {(report.targetType === 'post' || report.targetType === 'Post') && (
                        <div className="flex gap-3">
                          {report.targetContent.imageUrl || (report.targetContent.media && report.targetContent.media[0]?.url) ? (
                            <img 
                              src={report.targetContent.imageUrl || report.targetContent.media[0]?.url} 
                              alt="" 
                              className="w-12 h-12 rounded-lg object-cover bg-slate-800 flex-shrink-0"
                            />
                          ) : null}
                          <div>
                            <p className="text-slate-300 line-clamp-2">{report.targetContent.caption || 'No caption'}</p>
                            <p className="text-slate-500 text-[10px] mt-1">Author: {report.targetContent.userId?.displayName || 'Unknown'}</p>
                          </div>
                        </div>
                      )}

                      {(report.targetType === 'user' || report.targetType === 'User') && (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold overflow-hidden">
                            {report.targetContent.avatar ? (
                              <img src={report.targetContent.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (report.targetContent.displayName || 'U')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-slate-300 font-bold">{report.targetContent.displayName}</p>
                            <p className="text-slate-500 text-[10px]">{report.targetContent.email}</p>
                          </div>
                        </div>
                      )}

                      {(report.targetType === 'comment' || report.targetType === 'Comment') && (
                        <div>
                          <p className="text-slate-300 italic">"{report.targetContent.text}"</p>
                          <p className="text-slate-500 text-[10px] mt-1">Author: {report.targetContent.userName || 'Unknown'}</p>
                        </div>
                      )}

                      {(report.targetType === 'story' || report.targetType === 'Story') && (
                        <div className="flex gap-3">
                          {report.targetContent.image || report.targetContent.thumbnail ? (
                            <img 
                              src={report.targetContent.image || report.targetContent.thumbnail} 
                              alt="" 
                              className="w-12 h-16 rounded-lg object-cover bg-slate-800 flex-shrink-0"
                            />
                          ) : null}
                          <div>
                            <p className="text-slate-300 line-clamp-2">{report.targetContent.caption || 'Story with no caption'}</p>
                            <p className="text-slate-500 text-[10px] mt-1">Author: {report.targetContent.userName || 'Unknown'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 font-black uppercase tracking-widest border border-indigo-500/20">{report.targetType}</span>
                </td>
                <td className="px-6 py-4">{getStatusBadge(report.status)}</td>
                <td className="px-6 py-4 text-slate-400 text-sm">
                  {format(new Date(report.createdAt), 'MMM dd, HH:mm')}
                </td>
                <td className="px-6 py-4 text-right">
                  {report.status === 'pending' ? (
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => handleResolve(report._id, 'resolved')}
                        className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"
                        title="Resolve"
                      >
                        <HiOutlineCheckCircle className="text-xl" />
                      </button>
                      <button 
                        onClick={() => handleResolve(report._id, 'dismissed')}
                        className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                        title="Dismiss"
                      >
                        <HiOutlineXCircle className="text-xl" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-600 italic text-xs">Processed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && reports.length === 0 && (
          <div className="p-20 text-center text-slate-500">
            <HiOutlineClock className="text-4xl mx-auto mb-4 opacity-20" />
            <p className="italic font-medium">No {statusFilter} reports found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
