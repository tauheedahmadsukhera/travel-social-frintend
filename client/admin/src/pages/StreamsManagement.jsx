import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlineVideoCamera, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { format } from 'date-fns';

const StreamsManagement = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-streams', page],
    queryFn: async () => {
      const res = await adminAPI.getStreams(page, limit);
      if (!res.success) throw new Error('Failed to fetch streams');
      return res;
    },
    keepPreviousData: true,
    staleTime: 30 * 1000,
  });

  const streams = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const endStreamMutation = useMutation({
    mutationFn: (id) => adminAPI.endStream(id),
    onSuccess: () => {
      toast.success('Live stream ended successfully');
      queryClient.invalidateQueries(['admin-streams']);
    },
    onError: () => toast.error('Failed to end stream'),
  });

  const handleEndStream = (stream) => {
    if (!window.confirm(`Are you sure you want to force end the live stream: "${stream.title || 'Untitled'}"?`)) return;
    endStreamMutation.mutate(stream._id);
  };

  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-full">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">Live Streams</h2>
          <p className="text-slate-400">Monitor active and past live broadcasts. Force shut down any live streams instantly.</p>
        </div>
      </header>

      <div className="glass overflow-hidden flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Stream Title</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Host User ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Started</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan="5" className="px-6 py-8"><div className="h-4 bg-white/5 rounded w-full" /></td>
                  </tr>
                ))
              ) : streams.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="p-20 text-center text-slate-500">
                      <HiOutlineVideoCamera className="text-4xl mx-auto mb-4 opacity-20" />
                      <p className="italic">No streams found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                streams.map((stream) => (
                  <tr key={stream._id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl text-lg ${stream.isActive ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-400'}`}>
                          <HiOutlineVideoCamera className={stream.isActive ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                          <p className="text-white font-bold text-sm">
                            {stream.title || 'Untitled Stream'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                      {stream.userId || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${
                        stream.isActive ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {stream.isActive ? 'LIVE' : 'ENDED'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {stream.createdAt ? format(new Date(stream.createdAt), 'MMM dd, HH:mm') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {stream.isActive ? (
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEndStream(stream)}
                            disabled={endStreamMutation.isPending}
                            className="px-3 py-1 rounded-lg text-xs font-bold bg-red-950/40 text-red-400 hover:bg-red-600 hover:text-white transition-all border border-red-500/20"
                            title="Force end stream"
                          >
                            Terminate
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-600 italic text-xs">Ended</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-sm">
          <div className="text-slate-400">
            Showing <span className="text-white font-bold">{streams.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="text-white font-bold">{Math.min(page * limit, total)}</span> of{' '}
            <span className="text-white font-bold">{total}</span> streams
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
              onClick={() => { if (page < totalPages) setPage(old => old + 1); }}
              disabled={page >= totalPages || totalPages === 0}
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

export default StreamsManagement;
