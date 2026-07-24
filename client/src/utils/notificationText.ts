export function getNotificationActionText(item: any): string {
  const type = String(item?.type || '');
  if (type === 'message' || type === 'dm') return 'sent you a message';
  if (type === 'like') return 'liked your post';
  if (type === 'comment') return 'commented on your post';
  if (type === 'follow') return 'started following you';
  if (type === 'follow-request') return 'sent you a follow request';
  if (type === 'follow-approved') return 'approved your follow request';
  if (type === 'new-follower') return 'started following you';
  if (type === 'mention') return 'mentioned you in a post';
  if (type === 'tag') return 'tagged you in a post';
  if (type === 'live') return 'started a live stream';
  if (type === 'story') return 'posted a new story';
  if (type === 'story-mention') return 'mentioned you in a story';
  if (type === 'story-reply') return 'replied to your story';

  const msg = typeof item?.message === 'string' ? item.message.trim() : '';
  if (msg) return msg;

  return 'sent you a notification';
}

export function getNotificationDisplayText(item: any): string {
  const senderNameRaw = item?.senderName;
  const senderName = typeof senderNameRaw === 'string' && senderNameRaw.trim() ? senderNameRaw.trim() : 'Someone';
  
  const msg = typeof item?.message === 'string' ? item.message.trim() : '';
  if (msg) {
    // If the message already starts with the senderName or "Someone", use it directly.
    if (msg.toLowerCase().startsWith(senderName.toLowerCase()) || msg.toLowerCase().startsWith('someone')) {
      return msg;
    }
    // If the message is a location welcome or other auto-notification, use it directly.
    if (item.type === 'location_change' || msg.toLowerCase().startsWith('welcome')) {
      return msg;
    }
  }

  return `${senderName} ${getNotificationActionText(item)}`;
}
