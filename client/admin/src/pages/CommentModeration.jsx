import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlineTrash, HiOutlineSearch, HiOutlineChat, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { format } from 'date-fns';

const CommentModeration = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 20;

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-comments', page, debouncedSearch],
    queryFn: async () => {
      const res = await adminAPI.getComments(page, limit, debouncedSearch);
      if (!res.success) throw new Error('Failed to fetch comments');
      return res;
    },
    keepPreviousData: true,
    staleTime: 60 * 1000,
  });

  const comments = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const deleteCommentMutation = useMutation({
    mutationFn: (id) => adminAPI.deleteComment(id),
    onSuccess: () => {
      toast.success('Comment deleted successfully');
      queryClient.invalidateQueries(['admin-comments']);
    },
    onError: () => toast.error('Failed to delete comment'),
  });

  const handleDelete = (comment) => {
    if (!window.confirm(`Are you sure you want to permanently delete comment: "${comment.text}"?`)) return;
    deleteCommentMutation.mutate(comment._id);
  };

  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-full">
      <header className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Comment Moderation</h2>
          <p className="text-slate-400">Review and delete comments across the platform.</p>
        </div>
        <div className="relative">
          <HiOutlineSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search comment text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 transition-all w-64 text-white text-sm"
          />
        </div>
      </header>

      <div className="glass overflow-hidden flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Comment</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Author</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Post ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Created</th>
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
              ) : comments.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="p-20 text-center text-slate-500">
                      <HiOutlineChat className="text-4xl mx-auto mb-4 opacity-20" />
                      <p className="italic">No comments found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                comments.map((comment) => (
                  <tr key={comment._id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {comment.userAvatar ? (
                          <img
                            src={comment.userAvatar}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover bg-slate-800 border border-white/10"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : null}
                        <div>
                          <p className="text-white font-medium text-sm">
                            {comment.text}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300 text-sm font-semibold">
                      {comment.userName || 'Unnamed User'}
                      <p className="text-slate-500 text-[10px] font-mono mt-0.5">{String(comment.userId || '').slice(0, 12)}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                      {String(comment.postId || '').slice(0, 12)}...
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {comment.createdAt ? format(new Date(comment.createdAt), 'MMM dd, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDelete(comment)}
                          disabled={deleteCommentMutation.isPending}
                          className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                          title="Delete comment"
                        >
                          <HiOutlineTrash className="text-xl" />
                        </button>
                      </div>
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
            Showing <span className="text-white font-bold">{comments.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="text-white font-bold">{Math.min(page * limit, total)}</span> of{' '}
            <span className="text-white font-bold">{total}</span> comments
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

export default CommentModeration;
