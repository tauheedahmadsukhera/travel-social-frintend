/**
 * Unit Tests for DM Helpers
 * Tests normalizeMessage, mergeMessages, createTempId, dedupeById, getMessageId
 */
import {
  toTimestampMs,
  normalizeMessage,
  mergeMessages,
  createTempId,
  dedupeById,
  getMessageId,
  getFormattedActiveStatus,
} from '../dmHelpers';

// ==================== toTimestampMs ====================

describe('toTimestampMs', () => {
  it('returns Date.now() for null/undefined', () => {
    const before = Date.now();
    const result = toTimestampMs(null);
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(Date.now());
  });

  it('handles ISO string', () => {
    const result = toTimestampMs('2026-01-15T10:30:00.000Z');
    expect(result).toBe(new Date('2026-01-15T10:30:00.000Z').getTime());
  });

  it('handles Date object', () => {
    const d = new Date('2026-05-01T12:00:00Z');
    expect(toTimestampMs(d)).toBe(d.getTime());
  });

  it('handles Firestore-style seconds object', () => {
    const result = toTimestampMs({ seconds: 1700000000, nanoseconds: 500000000 });
    expect(result).toBe(1700000000 * 1000 + 500);
  });

  it('converts seconds to ms if value < 10 billion', () => {
    expect(toTimestampMs(1700000000)).toBe(1700000000 * 1000);
  });

  it('keeps milliseconds as-is if value > 10 billion', () => {
    expect(toTimestampMs(1700000000000)).toBe(1700000000000);
  });

  it('handles "null" and "undefined" strings', () => {
    const before = Date.now();
    expect(toTimestampMs('null')).toBeGreaterThanOrEqual(before);
    expect(toTimestampMs('undefined')).toBeGreaterThanOrEqual(before);
  });
});

// ==================== normalizeMessage ====================

describe('normalizeMessage', () => {
  it('normalizes a basic text message', () => {
    const raw = {
      _id: 'msg123',
      senderId: 'user1',
      text: 'Hello world',
      createdAt: '2026-05-16T10:00:00Z',
    };
    const result = normalizeMessage(raw);
    expect(result.id).toBe('msg123');
    expect(result.senderId).toBe('user1');
    expect(result.text).toBe('Hello world');
    expect(result.__ts).toBe(new Date('2026-05-16T10:00:00Z').getTime());
  });

  it('prefers .id over ._id', () => {
    const result = normalizeMessage({ id: 'preferred', _id: 'fallback' });
    expect(result.id).toBe('preferred');
  });

  it('generates a local ID if none provided', () => {
    const result = normalizeMessage({ text: 'orphan' });
    expect(result.id).toMatch(/^local_/);
  });

  it('detects audio mediaType from audioUrl', () => {
    const result = normalizeMessage({ id: '1', audioUrl: 'https://example.com/audio.m4a' });
    expect(result.mediaType).toBe('audio');
  });

  it('detects image mediaType from file extension', () => {
    const result = normalizeMessage({ id: '1', mediaUrl: 'https://example.com/photo.jpg' });
    expect(result.mediaType).toBe('image');
  });

  it('detects video mediaType from file extension', () => {
    const result = normalizeMessage({ id: '1', mediaUrl: 'https://example.com/clip.mp4' });
    expect(result.mediaType).toBe('video');
  });

  it('detects post mediaType from sharedPost', () => {
    const result = normalizeMessage({ id: '1', sharedPost: { postId: 'p1' } });
    expect(result.mediaType).toBe('post');
  });

  it('detects story mediaType from sharedStory', () => {
    const result = normalizeMessage({ id: '1', sharedStory: { storyId: 's1' } });
    expect(result.mediaType).toBe('story');
  });

  it('detects legacy story format from text', () => {
    const result = normalizeMessage({ id: '1', text: 'story://abc123' });
    expect(result.mediaType).toBe('story');
    expect(result.sharedStory?.storyId).toBe('abc123');
  });

  it('handles empty/null text gracefully', () => {
    const result = normalizeMessage({ id: '1', text: null });
    expect(result.text).toBeNull(); // spread keeps original null via ...m
  });

  it('normalizes fallback URLs (url, fileUrl, attachmentUrl)', () => {
    const result = normalizeMessage({ id: '1', fileUrl: 'https://cdn.com/file.png' });
    expect(result.mediaUrl).toBe('https://cdn.com/file.png');
    expect(result.mediaType).toBe('image');
  });
});

// ==================== mergeMessages ====================

describe('mergeMessages', () => {
  it('merges two arrays without duplicates', () => {
    const existing = [normalizeMessage({ id: 'a', text: 'old', createdAt: '2026-01-01T00:00:00Z' })];
    const incoming = [normalizeMessage({ id: 'b', text: 'new', createdAt: '2026-01-02T00:00:00Z' })];
    const result = mergeMessages(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it('deduplicates by ID', () => {
    const existing = [normalizeMessage({ id: 'same', text: 'v1', createdAt: '2026-01-01T00:00:00Z' })];
    const incoming = [normalizeMessage({ id: 'same', text: 'v2', createdAt: '2026-01-01T00:00:00Z' })];
    const result = mergeMessages(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('v2'); // incoming overwrites
  });

  it('sorts by descending timestamp (newest first)', () => {
    const existing = [normalizeMessage({ id: 'old', text: 'old', createdAt: '2026-01-01T00:00:00Z' })];
    const incoming = [normalizeMessage({ id: 'new', text: 'new', createdAt: '2026-06-01T00:00:00Z' })];
    const result = mergeMessages(existing, incoming);
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('old');
  });

  it('merges reactions from both existing and incoming', () => {
    const existing = [normalizeMessage({ id: 'x', reactions: { '❤️': ['user1'] }, createdAt: '2026-01-01T00:00:00Z' })];
    const incoming = [normalizeMessage({ id: 'x', reactions: { '🔥': ['user2'] }, createdAt: '2026-01-01T00:00:00Z' })];
    const result = mergeMessages(existing, incoming);
    expect(result[0].reactions).toEqual({ '❤️': ['user1'], '🔥': ['user2'] });
  });

  it('handles empty arrays', () => {
    expect(mergeMessages([], [])).toEqual([]);
    const single = [normalizeMessage({ id: '1', createdAt: '2026-01-01T00:00:00Z' })];
    expect(mergeMessages(single, [])).toHaveLength(1);
    expect(mergeMessages([], single)).toHaveLength(1);
  });
});

// ==================== createTempId ====================

describe('createTempId', () => {
  it('creates unique IDs', () => {
    const id1 = createTempId('test');
    const id2 = createTempId('test');
    expect(id1).not.toBe(id2);
  });

  it('starts with the given prefix', () => {
    const id = createTempId('msg');
    expect(id).toMatch(/^msg_/);
  });

  it('defaults to "temp" prefix', () => {
    const id = createTempId();
    expect(id).toMatch(/^temp_/);
  });
});

// ==================== dedupeById ====================

describe('dedupeById', () => {
  it('removes duplicate messages', () => {
    const msgs = [
      { id: 'a', text: 'first' },
      { id: 'b', text: 'second' },
      { id: 'a', text: 'duplicate' },
    ];
    const result = dedupeById(msgs);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('first'); // keeps first occurrence
  });

  it('handles _id field', () => {
    const msgs = [
      { _id: 'x', text: 'one' },
      { _id: 'x', text: 'two' },
    ];
    expect(dedupeById(msgs)).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(dedupeById([])).toEqual([]);
  });
});

// ==================== getMessageId ====================

describe('getMessageId', () => {
  it('returns id first', () => {
    expect(getMessageId({ id: 'a', _id: 'b' })).toBe('a');
  });

  it('falls back to _id', () => {
    expect(getMessageId({ _id: 'b' })).toBe('b');
  });

  it('falls back to messageId', () => {
    expect(getMessageId({ messageId: 'c' })).toBe('c');
  });

  it('returns empty string for null', () => {
    expect(getMessageId(null)).toBe('');
    expect(getMessageId(undefined)).toBe('');
  });
});

// ==================== getFormattedActiveStatus ====================

describe('getFormattedActiveStatus', () => {
  it('returns "Active" for null presence', () => {
    expect(getFormattedActiveStatus(null)).toBe('Active');
  });

  it('returns "Online" when online is true', () => {
    expect(getFormattedActiveStatus({ online: true })).toBe('Online');
  });

  it('returns "Just now" for very recent activity', () => {
    expect(getFormattedActiveStatus({ lastActive: new Date(Date.now() - 30000) })).toBe('Just now');
  });

  it('returns minutes ago for recent activity', () => {
    const result = getFormattedActiveStatus({ lastActive: new Date(Date.now() - 5 * 60000) });
    expect(result).toMatch(/5m ago/);
  });

  it('returns hours ago for older activity', () => {
    const result = getFormattedActiveStatus({ lastActive: new Date(Date.now() - 3 * 3600000) });
    expect(result).toMatch(/3h ago/);
  });
});
