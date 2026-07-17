import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlineTrash, HiOutlineSearch, HiOutlineExclamation, HiOutlinePhotograph, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { format } from 'date-fns';

const PostModeration = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
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
    queryKey: ['admin-posts', page, debouncedSearch, flaggedOnly],
    queryFn: async () => {
      const res = await adminAPI.getPosts(page, limit, debouncedSearch, flaggedOnly);
      if (!res.success) throw new Error('Failed to fetch posts');
      return res;
    },
    keepPreviousData: true,
    staleTime: 60 * 1000,
  });

  const posts = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const deletePostMutation = useMutation({
    mutationFn: (postId) => adminAPI.deletePost(postId),
    onSuccess: () => {
      toast.success('Post deleted successfully');
      queryClient.invalidateQueries(['admin-posts']);
    },
    onError: () => toast.error('Failed to delete post'),
  });

  const handleDelete = (post) => {
    const caption = post.caption ? `"${post.caption.slice(0, 40)}..."` : 'this post';
    if (!window.confirm(`Are you sure you want to permanently delete ${caption}?`)) return;
    deletePostMutation.mutate(post._id);
  };

  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-full">
      <header className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Post Moderation</h2>
          <p className="text-slate-400">Review and delete posts across the platform.</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
              flaggedOnly
                ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                : 'border-white/10 text-slate-500 hover:border-white/20 hover:text-white'
            }`}
          >
            <HiOutlineExclamation />
            {flaggedOnly ? 'Showing Flagged' : 'Show Flagged Only'}
          </button>
          <div className="relative">
            <HiOutlineSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search caption..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 transition-all w-64 text-white text-sm"
            />
          </div>
        </div>
      </header>

      <div className="glass overflow-hidden flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Post</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Author ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Category</th>
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
              ) : posts.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="p-20 text-center text-slate-500">
                      <HiOutlinePhotograph className="text-4xl mx-auto mb-4 opacity-20" />
                      <p className="italic">No posts found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                posts.map((post) => {
                  const media = Array.isArray(post.media) ? post.media[0] : null;
                  const thumb = media?.url || media?.thumbnail || post.imageUrl || post.thumbnailUrl;
                  return (
                    <tr key={post._id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="w-14 h-14 rounded-xl object-cover bg-slate-800 border border-white/10 flex-shrink-0"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-indigo-500/10 border border-white/10 flex items-center justify-center flex-shrink-0">
                              <HiOutlinePhotograph className="text-slate-600 text-2xl" />
                            </div>
                          )}
                          <div className="max-w-xs">
                            <p className="text-white font-medium text-sm line-clamp-2">
                              {post.caption || <span className="text-slate-500 italic">No caption</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                        {String(post.userId?._id || post.userId || '—').slice(0, 12)}...
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                          {typeof post.category === 'object' ? post.category?.name : (post.category || 'N/A')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {post.createdAt ? format(new Date(post.createdAt), 'MMM dd, yyyy') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDelete(post)}
                            disabled={deletePostMutation.isPending}
                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                            title="Delete post"
                          >
                            <HiOutlineTrash className="text-xl" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-sm">
          <div className="text-slate-400">
            Showing <span className="text-white font-bold">{posts.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="text-white font-bold">{Math.min(page * limit, total)}</span> of{' '}
            <span className="text-white font-bold">{total}</span> posts
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

export default PostModeration;
