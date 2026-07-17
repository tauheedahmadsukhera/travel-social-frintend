import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlineTrash, HiOutlinePhotograph, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { format } from 'date-fns';

const StoryModeration = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-stories', page],
    queryFn: async () => {
      const res = await adminAPI.getStories(page, limit);
      if (!res.success) throw new Error('Failed to fetch stories');
      return res;
    },
    keepPreviousData: true,
    staleTime: 60 * 1000,
  });

  const stories = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const deleteStoryMutation = useMutation({
    mutationFn: (id) => adminAPI.deleteStory(id),
    onSuccess: () => {
      toast.success('Story deleted successfully');
      queryClient.invalidateQueries(['admin-stories']);
    },
    onError: () => toast.error('Failed to delete story'),
  });

  const handleDelete = (story) => {
    if (!window.confirm(`Are you sure you want to permanently delete this story by "${story.userName || 'Unknown'}"?`)) return;
    deleteStoryMutation.mutate(story._id);
  };

  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-full">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">Story Moderation</h2>
          <p className="text-slate-400">Moderating user stories before they automatically expire (24h).</p>
        </div>
      </header>

      <div className="glass overflow-hidden flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Story Preview</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Author</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Caption</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Expires At</th>
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
              ) : stories.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="p-20 text-center text-slate-500">
                      <HiOutlinePhotograph className="text-4xl mx-auto mb-4 opacity-20" />
                      <p className="italic">No active stories found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                stories.map((story) => {
                  const media = story.image || story.video || story.thumbnail;
                  return (
                    <tr key={story._id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        {media ? (
                          <div className="w-12 h-20 rounded-lg overflow-hidden border border-white/10 bg-slate-800 relative">
                            {story.video ? (
                              <video src={story.video} className="w-full h-full object-cover" muted />
                            ) : (
                              <img src={story.image || story.thumbnail} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                        ) : (
                          <div className="w-12 h-20 rounded-lg bg-indigo-500/10 border border-white/10 flex items-center justify-center">
                            <HiOutlinePhotograph className="text-slate-600 text-xl" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm font-semibold">
                        {story.userName || 'Unnamed User'}
                        <p className="text-slate-500 text-[10px] font-mono mt-0.5">{String(story.userId || '').slice(0, 12)}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm">
                        {story.caption || <span className="text-slate-600 italic">No caption</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {story.expiresAt ? format(new Date(story.expiresAt), 'MMM dd, HH:mm') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDelete(story)}
                            disabled={deleteStoryMutation.isPending}
                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                            title="Delete story"
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
            Showing <span className="text-white font-bold">{stories.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="text-white font-bold">{Math.min(page * limit, total)}</span> of{' '}
            <span className="text-white font-bold">{total}</span> stories
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

export default StoryModeration;
