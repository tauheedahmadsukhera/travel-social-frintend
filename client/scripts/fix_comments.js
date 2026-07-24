const fs = require('fs');
let src = fs.readFileSync('app/components/CommentSection.tsx', 'utf8');

// Find start and end of renderComment function
const startMarker = '  const renderComment = (comment: Comment, isReply: boolean = false, parentId?: string) => {';
const endMarker = '\n  };\n\n  return (';

const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker, startIdx);

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find renderComment boundaries');
    console.log('startIdx:', startIdx, 'endIdx:', endIdx);
    process.exit(1);
}

const beforeRender = src.slice(0, startIdx);
const afterRender = src.slice(endIdx); // starts with \n  };\n\n  return (

const newRender = `  const renderComment = (comment: Comment, isReply: boolean = false, parentId?: string) => {
    let currentUserId = '';
    if (typeof currentUser === 'string') {
      currentUserId = currentUser;
    } else {
      currentUserId = currentUser?.uid || currentUser?.id || currentUser?.userId || currentUser?.firebaseUid || currentUser?._id || '';
    }

    const isOwner = currentUserId === comment.userId;
    const isPostOwner = currentUserId === postOwnerId;
    const canDelete = isOwner || isPostOwner;

    // Count hearts from reactions
    let heartCount = 0;
    let userLiked = false;
    if (comment.reactions && typeof comment.reactions === 'object' && !Array.isArray(comment.reactions)) {
      Object.entries(comment.reactions).forEach(([key, value]) => {
        if (typeof value === 'string') {
          heartCount++;
          if (key === currentUserId) userLiked = true;
        } else if (Array.isArray(value)) {
          heartCount += value.length;
          if (value.includes(currentUserId)) userLiked = true;
        }
      });
    }

    return (
      <View key={comment.id} style={[styles.commentRow, isReply && styles.replyRow]}>
        {/* Avatar */}
        <CommentAvatar userId={comment.userId} userAvatar={comment.userAvatar} size={isReply ? 28 : 36} />

        {/* Center: bubble + actions + replies */}
        <View style={styles.commentContent}>
          {/* Grey bubble - kept as requested */}
          <View style={styles.commentBubble}>
            <View style={styles.commentHeader}>
              <Text style={styles.userName}>{comment.userName}</Text>
              <Text style={styles.timeAgo}>{getTimeAgo(comment.createdAt)}</Text>
            </View>
            <Text style={styles.commentText}>{comment.text}</Text>
            {comment.editedAt && <Text style={styles.editedLabel}>(edited)</Text>}
          </View>

          {/* Actions: Reply | ... */}
          <View style={styles.commentActions}>
            {!isReply && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setReplyTo({ id: comment.id, userName: comment.userName })}
              >
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() =>
                  Alert.alert('Comment Options', '', [
                    { text: 'Cancel', style: 'cancel' },
                    ...(isOwner
                      ? [{ text: 'Edit', onPress: () => setEditingComment({ id: comment.id, text: comment.text, isReply, parentId }) }]
                      : []),
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => handleDeleteComment(comment.id, isReply, parentId, comment.id),
                    },
                  ])
                }
              >
                <Feather name="more-horizontal" size={14} color="#aaa" />
              </TouchableOpacity>
            )}
          </View>

          {/* Nested replies */}
          {!isReply && comment.replies && comment.replies.length > 0 && (
            <View style={styles.repliesContainer}>
              {comment.replies.map((reply) => (
                <View key={reply.id}>{renderComment(reply, true, comment.id)}</View>
              ))}
            </View>
          )}
        </View>

        {/* Right: Heart icon (Instagram style) */}
        <TouchableOpacity
          style={styles.heartBtn}
          onPress={() => handleReaction(comment.id, 'heart')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={userLiked ? 'heart' : 'heart-outline'}
            size={isReply ? 14 : 16}
            color={userLiked ? '#e74c3c' : '#aaa'}
          />
          {heartCount > 0 && <Text style={styles.heartCount}>{heartCount}</Text>}
        </TouchableOpacity>
      </View>
    );
  }`;

src = beforeRender + newRender + afterRender;

// Remove the Reactions Picker Modal (showReactions modal)
// Find it by looking for the {/* Reactions Picker */} comment block
const reactionsModalStart = src.indexOf('      {/* Reactions Picker */}');
if (reactionsModalStart !== -1) {
    // Find the closing of this block
    const reactionsModalEnd = src.indexOf('\n      )}\n    </View>', reactionsModalStart);
    if (reactionsModalEnd !== -1) {
        src = src.slice(0, reactionsModalStart) + src.slice(reactionsModalEnd);
    } else {
        console.log('Reactions end not found, skipping');
    }
}

// Now update styles - add heartBtn and heartCount, fix existing styles
const oldCommentActions = `  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },`;

const newCommentActions = `  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },
  heartBtn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    paddingLeft: 8,
    minWidth: 28,
  },
  heartCount: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
    textAlign: 'center',
  },`;

if (src.includes(oldCommentActions)) {
    src = src.replace(oldCommentActions, newCommentActions);
    console.log('styles updated');
} else {
    // Try to add before closing of styles
    console.log('commentActions style not found, searching...');
    const idx = src.indexOf('  commentActions:');
    if (idx !== -1) {
        console.log('found at idx:', idx, src.slice(idx, idx + 80));
    }
}

fs.writeFileSync('app/components/CommentSection.tsx', src, 'utf8');
console.log('Done! Lines:', src.split('\n').length);
