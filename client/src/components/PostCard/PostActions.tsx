import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from './PostCard.styles';
import SaveButton from '../SaveButton';

interface PostActionsProps {
  isLiked: boolean;
  onLikePress: () => void;
  onCommentPress: () => void;
  onReactionPress: () => void;
  onSharePress: () => void;
  post: any;
  likeCount: number;
  commentCount: number;
  reactions: any[];
  currentUserId?: string;
}

const PostActions: React.FC<PostActionsProps> = ({
  isLiked,
  onLikePress,
  onCommentPress,
  onReactionPress,
  onSharePress,
  post,
  likeCount,
  commentCount,
  reactions,
  currentUserId
}) => {
  // Robust matching for different ID formats
  const myReaction = reactions?.find(r => {
    const rId = String(r.userId || r.uid || r.id || r._id || '');
    const cId = String(currentUserId || '');
    return rId && cId && rId === cId;
  });

  // Extract unique emojis to display (up to 3)
  const uniqueEmojis = React.useMemo(() => {
    if (!reactions || !Array.isArray(reactions)) return [];
    const set = new Set<string>();
    for (const r of reactions) {
      if (r?.emoji) set.add(r.emoji);
    }
    return Array.from(set).slice(0, 3);
  }, [reactions]);

  return (
    <View style={styles.iconRow}>
      <View style={styles.iconRowLeft}>
        <TouchableOpacity testID="like-button" onPress={onLikePress} style={styles.actionItem}>
          <Ionicons 
            name={isLiked ? "heart" : "heart-outline"} 
            size={24} 
            color={isLiked ? "#ff4d4d" : "#222"} 
          />
          {likeCount > 0 && <Text style={styles.actionCount}>{likeCount}</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={onCommentPress} style={styles.actionItem}>
          <Ionicons name="chatbubble-outline" size={22} color="#000" />
          {commentCount > 0 && <Text style={styles.actionCount}>{commentCount}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={onSharePress} style={styles.actionItem}>
          <Ionicons name="paper-plane-outline" size={22} color="#222" />
        </TouchableOpacity>

        <SaveButton post={post} />
      </View>

      <View style={styles.iconRowRightGroup}>
        {uniqueEmojis.length > 0 && (
          <TouchableOpacity onPress={onReactionPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
              {uniqueEmojis.map((emoji, index) => (
                <View 
                  key={index} 
                  style={{
                    marginLeft: index > 0 ? -2 : 0,
                    zIndex: 3 - index,
                  }}
                >
                  <Text style={{ fontSize: 14, lineHeight: 17 }}>{emoji}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 13, color: '#666', fontWeight: '600', marginLeft: 6 }}>{reactions.length}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default PostActions;
