 import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './PostCard.styles';

interface PostCaptionProps {
  postUserName: string;
  caption: string;
  hashtags: string[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onHashtagPress?: (tag: string) => void;
}


const PostCaption: React.FC<PostCaptionProps> = ({
  postUserName,
  caption,
  hashtags,
  isExpanded,
  onToggleExpand,
  onHashtagPress,
}) => {

  const hasCaption = caption && caption.trim().length > 0;
  const hasHashtags = hashtags && hashtags.length > 0;

  if (!hasCaption && !hasHashtags) return null;

  return (
    <View style={styles.captionWrap}>
      {hasCaption ? (
        <Text style={styles.caption} numberOfLines={isExpanded ? undefined : 2}>
          {caption}
        </Text>
      ) : null}
      
      {caption && caption.length > 80 && !isExpanded && (
        <TouchableOpacity onPress={onToggleExpand}>
          <Text style={styles.captionMore}>more</Text>
        </TouchableOpacity>
      )}

      {hashtags && hashtags.length > 0 && (
        <View style={styles.hashtags}>
          {hashtags.map((tag, idx) => (
            <TouchableOpacity 
              key={idx} 
              onPress={() => onHashtagPress?.(tag)}
              style={styles.hashtag}
            >
              <Text style={styles.hashtagText}>#{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

    </View>
  );
};

export default React.memo(PostCaption);
