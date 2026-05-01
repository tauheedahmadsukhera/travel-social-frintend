import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  HiOutlineCheckCircle, 
  HiOutlineXCircle, 
  HiOutlineClock,
  HiOutlineFilter,
  HiOutlineSearch
} from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const fetchReports = async () => {
    try {
      // In a real app, this would use the current user's token
      const res = await axios.get('/api/moderation/reports');
      if (res.data.success) {
        setReports(res.data.data);
      }
    } catch (err) {
      // Mock data if API fails for demo
      setReports([
        { _id: '1', targetType: 'Post', reason: 'Spam', reporterId: 'usr_1', status: 'pending', createdAt: new Date() },
        { _id: '2', targetType: 'User', reason: 'Harassment', reporterId: 'usr_2', status: 'resolved', createdAt: new Date() },
        { _id: '3', targetType: 'Comment', reason: 'Inappropriate', reporterId: 'usr_3', status: 'pending', createdAt: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id, status) => {
    try {
      await axios.post('/api/moderation/resolve', { 
        reportId: id, 
        status, 
        adminNote: 'Resolved by admin' 
      });
      toast.success(`Report ${status}`);
      fetchReports();
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
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Content Moderation</h2>
          <p className="text-slate-400 mt-1">Review and manage reported content across the platform.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search reports..." 
              className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-indigo-500 outline-none transition-all"
            />
          </div>
          <button className="glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10 transition-all">
            <HiOutlineFilter />
            Filter
          </button>
        </div>
      </header>

      <div className="glass overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Report Details</th>
              <th className="px-6 py-4">Target</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {reports.map((report) => (
              <tr key={report._id} className="hover:bg-white/5 transition-all">
                <td className="px-6 py-4">
                  <p className="font-bold text-white">{report.reason}</p>
                  <p className="text-xs text-slate-500 mt-1">Reported by: {report.reporterId}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 font-medium">{report.targetType}</span>
                </td>
                <td className="px-6 py-4">{getStatusBadge(report.status)}</td>
                <td className="px-6 py-4 text-slate-400 text-sm">
                  {format(new Date(report.createdAt), 'MMM dd, HH:mm')}
                </td>
                <td className="px-6 py-4 text-right">
                  {report.status === 'pending' && (
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleResolve(report._id, 'resolved')}
                        className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"
                        title="Resolve"
                      >
                        <HiOutlineCheckCircle className="text-lg" />
                      </button>
                      <button 
                        onClick={() => handleResolve(report._id, 'dismissed')}
                        className="p-2 rounded-lg bg-slate-500/20 text-slate-400 hover:bg-slate-500 hover:text-white transition-all"
                        title="Dismiss"
                      >
                        <HiOutlineXCircle className="text-lg" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports.length === 0 && (
          <div className="p-20 text-center text-slate-500">
            <HiOutlineClock className="text-4xl mx-auto mb-4 opacity-20" />
            <p>No reports found. All clean!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
