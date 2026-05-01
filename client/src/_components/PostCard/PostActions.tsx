import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, Feather } from "@expo/vector-icons";
import { styles } from './PostCard.styles';
import SaveButton from '../SaveButton';

interface PostActionsProps {
  isLiked: boolean;
  onLikePress: () => void;
  onCommentPress: () => void;
  onSharePress: () => void;
  post: any;
  likeCount: number;
  commentCount: number;
  reactions: any;
}

const PostActions: React.FC<PostActionsProps> = ({
  isLiked,
  onLikePress,
  onCommentPress,
  onSharePress,
  post,
  likeCount,
  commentCount,
  reactions,
}) => {
  return (
    <View style={styles.iconRow}>
      <View style={styles.iconRowLeft}>
        <TouchableOpacity onPress={onLikePress} style={styles.actionItem}>
          <Ionicons 
            name={isLiked ? "heart" : "heart-outline"} 
            size={26} 
            color={isLiked ? "#ff4d4d" : "#222"} 
          />
          {likeCount > 0 && <Text style={styles.actionCount}>{likeCount}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={onCommentPress} style={styles.actionItem}>
          <Ionicons name="chatbubble-outline" size={24} color="#222" />
          {commentCount > 0 && <Text style={styles.actionCount}>{commentCount}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={onSharePress} style={styles.actionItem}>
          <Feather name="send" size={24} color="#222" />
        </TouchableOpacity>
      </View>

      <View style={styles.iconRowRightGroup}>
        <SaveButton post={post} />
      </View>
    </View>
  );
};

export default React.memo(PostActions);
