import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlineSpeakerphone, HiOutlineCheckCircle } from 'react-icons/hi';

const NOTIFICATION_TYPES = [
  { value: 'announcement', label: '📢 Announcement', desc: 'General platform announcement' },
  { value: 'update', label: '🚀 App Update', desc: 'New feature or update notification' },
  { value: 'promotion', label: '🎉 Promotion', desc: 'Event or promotional message' },
  { value: 'warning', label: '⚠️ Warning', desc: 'System warning or maintenance notice' },
];

const Broadcast = () => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('announcement');
  const [lastResult, setLastResult] = useState(null);

  const broadcastMutation = useMutation({
    mutationFn: () => adminAPI.broadcastNotification(title, message, type),
    onSuccess: (res) => {
      toast.success(`Broadcast sent to ${res.recipientCount} users!`);
      setLastResult(res);
      setTitle('');
      setMessage('');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Broadcast failed');
    },
  });

  const handleSend = (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Title and message are required');
      return;
    }
    if (!window.confirm(`Send "${title}" to ALL active users?`)) return;
    broadcastMutation.mutate();
  };

  const selectedType = NOTIFICATION_TYPES.find(t => t.value === type);

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h2 className="text-3xl font-black text-white">Broadcast Notifications</h2>
        <p className="text-slate-400">Send a message to all active users on the platform instantly.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Compose Form */}
        <div className="glass p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <HiOutlineSpeakerphone className="text-indigo-500 text-2xl" />
            <h3 className="text-xl font-bold">Compose Message</h3>
          </div>

          <form onSubmit={handleSend} className="space-y-6">
            {/* Type selector */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">
                Notification Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`p-3 rounded-xl text-left border transition-all ${
                      type === t.value
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                        : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <p className="font-bold text-sm">{t.label}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="e.g. New Feature: Passport Stamps!"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all text-white font-bold"
              />
              <p className="text-[10px] text-slate-600 mt-1 text-right">{title.length}/100</p>
            </div>

            {/* Message */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={300}
                rows={5}
                placeholder="Write your message to all users here..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all text-white resize-none"
              />
              <p className="text-[10px] text-slate-600 mt-1 text-right">{message.length}/300</p>
            </div>

            <button
              type="submit"
              disabled={broadcastMutation.isPending || !title.trim() || !message.trim()}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
            >
              {broadcastMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending broadcast...
                </span>
              ) : (
                <>
                  <HiOutlineSpeakerphone className="text-lg" />
                  Send to All Users
                </>
              )}
            </button>
          </form>
        </div>

        {/* Preview + Last Result */}
        <div className="space-y-6">
          {/* Live Preview */}
          <div className="glass p-8 space-y-4">
            <h3 className="text-lg font-bold text-slate-300">Live Preview</h3>
            <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  T
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <p className="text-white font-bold text-sm">{title || 'Notification Title'}</p>
                    <span className="text-[10px] text-slate-500">now</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                    {message || 'Your message will appear here...'}
                  </p>
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                    type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    type === 'promotion' ? 'bg-emerald-500/20 text-emerald-400' :
                    type === 'update' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-indigo-500/20 text-indigo-400'
                  }`}>
                    {selectedType?.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Last broadcast result */}
          {lastResult && (
            <div className="glass p-6 space-y-3 border border-emerald-500/30">
              <div className="flex items-center gap-3">
                <HiOutlineCheckCircle className="text-emerald-500 text-2xl" />
                <h3 className="text-emerald-400 font-bold">Last Broadcast Successful</h3>
              </div>
              <p className="text-slate-300 text-sm">
                Sent to <span className="text-white font-black">{lastResult.recipientCount?.toLocaleString()}</span> active users.
              </p>
              <p className="text-slate-500 text-xs">
                {new Date().toLocaleString()}
              </p>
            </div>
          )}

          {/* Warning */}
          <div className="glass p-6 border border-orange-500/20">
            <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-2">⚠️ Important</p>
            <ul className="text-slate-400 text-xs space-y-1 list-disc list-inside">
              <li>This message will be sent to ALL active users</li>
              <li>Suspended users will not receive this broadcast</li>
              <li>Use responsibly — excessive broadcasts reduce engagement</li>
              <li>This action is logged in Admin Audit Logs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Broadcast;
