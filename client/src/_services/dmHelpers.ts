import { DEFAULT_AVATAR_URL } from '@/lib/api';

export const toTimestampMs = (raw: any): number => {
  if (!raw) return Date.now();
  if (raw instanceof Date) return raw.getTime();

  if (typeof raw === 'object') {
    const anyRaw: any = raw;
    if (typeof anyRaw?.toDate === 'function') {
      try {
        const d = anyRaw.toDate();
        if (d instanceof Date) return d.getTime();
      } catch { }
    }
    const s = anyRaw?.seconds ?? anyRaw?._seconds;
    const ns = anyRaw?.nanoseconds ?? anyRaw?._nanoseconds ?? 0;
    if (typeof s === 'number' && Number.isFinite(s)) {
      const extra = typeof ns === 'number' && Number.isFinite(ns) ? Math.floor(ns / 1_000_000) : 0;
      return s * 1000 + extra;
    }
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 0 && raw < 10_000_000_000) return raw * 1000;
    return raw;
  }

  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : Date.now();
};

export const normalizeMessage = (m: any): any => {
  const rawText = typeof m?.text === 'string' ? m.text : '';
  const trimmedText = rawText.trim();
  const legacyStoryMatch = rawText.match(/story[:;]\/\/([A-Za-z0-9_-]+)|Shared a story:\s*([A-Za-z0-9_-]+)/i);
  const legacyStoryId = legacyStoryMatch?.[1] || legacyStoryMatch?.[2] || '';

  const normalizedMediaType = m?.mediaType || m?.type || m?.messageType
    || (m?.audioUrl ? 'audio' : undefined)
    || ((m?.audioDuration || m?.duration) && !trimmedText ? 'audio' : undefined)
    || (m?.sharedStory ? 'story' : undefined)
    || (legacyStoryId ? 'story' : undefined)
    || (typeof (m?.mediaUrl || m?.url || m?.fileUrl) === 'string' && /\.(m4a|aac|mp3|wav|ogg)(\?|$)/i.test(String(m?.mediaUrl || m?.url || m?.fileUrl)) ? 'audio' : undefined)
    || (typeof (m?.mediaUrl || m?.url || m?.fileUrl) === 'string' && /\.(mp4|mov|webm)(\?|$)/i.test(String(m?.mediaUrl || m?.url || m?.fileUrl)) ? 'video' : undefined)
    || (typeof (m?.mediaUrl || m?.url || m?.fileUrl) === 'string' && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(String(m?.mediaUrl || m?.url || m?.fileUrl)) ? 'image' : undefined)
    || (m?.imageUrl ? 'image' : undefined)
    || (m?.sharedPost ? 'post' : undefined);

  const normalizedMediaUrl = m?.mediaUrl || m?.url || m?.fileUrl || m?.attachmentUrl || m?.media?.url || m?.imageUrl;
  const normalizedAudioUrl = m?.audioUrl || (normalizedMediaType === 'audio' ? normalizedMediaUrl : undefined);
  const normalizedAudioDuration = m?.audioDuration || m?.duration;

  const id = m?.id || m?._id || m?.messageId || `local_${Date.now()}`;
  
  const rootCreatedAt = m?.createdAt;
  const rootTimestamp = m?.timestamp;
  
  const base = {
    ...m,
    id: String(id),
    createdAt: rootCreatedAt,
    timestamp: rootTimestamp,
    mediaType: normalizedMediaType,
    ...(legacyStoryId && !m?.sharedStory
      ? {
          sharedStory: {
            storyId: legacyStoryId,
            id: legacyStoryId,
            userId: m?.senderId,
            userName: 'Story',
            userAvatar: DEFAULT_AVATAR_URL,
          }
        }
      : {}),
    ...(normalizedMediaUrl ? { mediaUrl: normalizedMediaUrl } : {}),
    ...(normalizedAudioUrl ? { audioUrl: normalizedAudioUrl } : {}),
    ...(normalizedAudioDuration ? { audioDuration: normalizedAudioDuration } : {}),
  };

  const t = toTimestampMs(rootCreatedAt ?? rootTimestamp);
  return { ...base, __ts: t };
};

export const mergeMessages = (existing: any[], incoming: any[]): any[] => {
  const map = new Map<string, any>();

  existing.forEach((m) => {
    map.set(String(m.id || m._id || m.messageId), m);
  });

  incoming.forEach((m) => {
    const n = normalizeMessage(m);
    const prev = map.get(n.id) || {};
    
    map.set(n.id, {
      ...prev,
      ...n,
      reactions: { ...(prev.reactions || {}), ...(n.reactions || {}) },
    });
  });

  return Array.from(map.values()).sort((a, b) => (b.__ts || 0) - (a.__ts || 0));
};

export const createTempId = (prefix: string = 'temp') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const dedupeById = (messages: any[]): any[] => {
  const seen = new Set();
  return messages.filter(m => {
    const id = m.id || m._id || m.messageId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const getMessageId = (m: any): string => String(m?.id || m?._id || m?.messageId || '');

export const getFormattedActiveStatus = (presence: any): string => {
  if (!presence) return 'Active';
  if (presence.online) return 'Online';
  if (!presence.lastActive) return 'Active';
  
  const lastActive = toTimestampMs(presence.lastActive);
  const diff = Date.now() - lastActive;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return 'Active';
};
