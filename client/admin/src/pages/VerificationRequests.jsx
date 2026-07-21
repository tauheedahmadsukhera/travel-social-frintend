import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/adminService';
import { 
  HiOutlineCheck, 
  HiOutlineX, 
  HiOutlineEye,
  HiOutlineShieldCheck
} from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const VerificationRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  
  // Modal states
  const [selectedImage, setSelectedImage] = useState(null);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getVerificationRequests(page, 20, statusFilter);
      if (res.success) {
        setRequests(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      }
    } catch (err) {
      toast.error('Failed to load verification requests');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);


  const handleUpdateStatus = async (id, status, reason = '') => {
    try {
      const res = await adminAPI.updateVerificationRequestStatus(id, status, reason);
      if (res.success) {
        toast.success(`Request ${status === 'approved' ? 'approved' : 'rejected'} successfully`);
        setRejectingRequest(null);
        setRejectionReason('');
        fetchRequests();
      }
    } catch (err) {
      toast.error('Action failed');
    }
  };

  const openRejectionModal = (request) => {
    setRejectingRequest(request);
    setRejectionReason('');
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'approved': 
        return <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">Approved</span>;
      case 'rejected': 
        return <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider">Rejected</span>;
      default: 
        return <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-wider">Pending</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white flex items-center gap-2">
            <HiOutlineShieldCheck className="text-indigo-400" />
            Verification Requests
          </h2>
          <p className="text-slate-400">Review and moderate user requests for verification badges (blue ticks).</p>
        </div>
        <div className="flex gap-4">
          <div className="flex bg-white/5 rounded-xl p-1">
            {['pending', 'approved', 'rejected'].map(s => (
              <button 
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
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
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Legal Full Name</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">ID Document</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1, 2, 3].map(i => (
                <tr key={i} className="animate-pulse">
                  <td colSpan="7" className="px-6 py-8"><div className="h-4 bg-white/5 rounded w-full" /></td>
                </tr>
              ))
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-8 text-center text-slate-500">
                  No verification requests found matching this status.
                </td>
              </tr>
            ) : requests.map((req) => (
              <tr key={req._id} className="hover:bg-white/[0.01] transition-all group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold overflow-hidden border border-white/10 flex-shrink-0">
                      {req.user?.avatar || req.user?.photoURL || req.user?.profilePicture ? (
                        <img 
                          src={req.user.avatar || req.user.photoURL || req.user.profilePicture} 
                          alt="" 
                          className="w-10 h-10 object-cover" 
                        />
                      ) : (req.user?.displayName || req.user?.username || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white leading-tight">{req.user?.displayName || 'User'}</p>
                      <p className="text-slate-400 text-xs mt-0.5">@{req.user?.username || 'unknown'}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{req.user?.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 font-semibold text-white">
                  {req.fullName}
                </td>
                <td className="px-6 py-4 text-slate-300">
                  <span className="px-2 py-1 bg-white/5 border border-white/5 rounded-md text-xs font-semibold">
                    {req.category}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="relative w-16 h-12 rounded-lg bg-black/40 overflow-hidden border border-white/10 flex items-center justify-center group/img">
                    <img 
                      src={req.documentUrl} 
                      alt="ID Document" 
                      className="w-full h-full object-cover"
                    />
                    <button 
                      onClick={() => setSelectedImage(req.documentUrl)}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <HiOutlineEye className="text-white text-lg" />
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(req.status)}
                  {req.status === 'rejected' && req.rejectionReason && (
                    <p className="text-slate-500 text-[10px] mt-1 italic line-clamp-1" title={req.rejectionReason}>
                      Reason: {req.rejectionReason}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4 text-slate-400 text-xs">
                  {format(new Date(req.createdAt), 'dd MMM yyyy')}
                  <p className="text-[9px] text-slate-500 mt-1">{format(new Date(req.createdAt), 'hh:mm a')}</p>
                </td>
                <td className="px-6 py-4 text-right">
                  {req.status === 'pending' ? (
                    <div className="flex gap-2 justify-end">
                      <button 
                        onClick={() => handleUpdateStatus(req._id, 'approved')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-md shadow-emerald-500/10"
                      >
                        <HiOutlineCheck className="text-sm" />
                        Approve
                      </button>
                      <button 
                        onClick={() => openRejectionModal(req)}
                        className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-md shadow-red-500/10"
                      >
                        <HiOutlineX className="text-sm" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-500 text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 rounded-xl p-4">
          <span className="text-xs text-slate-500">
            Showing Page {page} of {pagination.pages} ({pagination.total} requests)
          </span>
          <div className="flex gap-2">
            <button 
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-slate-300 text-xs font-bold hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 transition-all"
            >
              Previous
            </button>
            <button 
              disabled={page >= pagination.pages}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-slate-300 text-xs font-bold hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="relative max-w-4xl max-h-[85vh] w-full bg-slate-900/90 rounded-2xl p-4 border border-white/10 flex flex-col items-center">
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-all"
            >
              <HiOutlineX className="text-xl" />
            </button>
            <div className="w-full flex-1 overflow-auto flex items-center justify-center mt-6">
              <img 
                src={selectedImage} 
                alt="Document Preview" 
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl" 
              />
            </div>
            <div className="mt-4">
              <a 
                href={selectedImage} 
                target="_blank" 
                rel="noreferrer" 
                className="text-indigo-400 hover:text-indigo-300 text-sm font-bold flex items-center gap-1"
              >
                Open in new tab
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold text-white mb-2">Reject Verification Request</h3>
            <p className="text-xs text-slate-400 mb-4">
              Specify the reason why @{rejectingRequest.user?.username || 'user'}'s verification request is being rejected. This will be sent as a notification to the user.
            </p>
            <textarea
              rows="4"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., The name on the government-issued ID does not match the profile name, or the image provided is blurry."
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-red-500 transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setRejectingRequest(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleUpdateStatus(rejectingRequest._id, 'rejected', rejectionReason)}
                disabled={!rejectionReason.trim()}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold transition-all"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VerificationRequests;
