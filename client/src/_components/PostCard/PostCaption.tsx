 import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './PostCard.styles';

interface PostCaptionProps {
  postUserName: string;
  caption: string;
  hashtags: string[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const PostCaption: React.FC<PostCaptionProps> = ({
  postUserName,
  caption,
  hashtags,
  isExpanded,
  onToggleExpand,
}) => {
  if (!caption && (!hashtags || hashtags.length === 0)) return null;

  return (
    <View style={styles.captionWrap}>
      {caption ? (
        <Text style={styles.caption} numberOfLines={isExpanded ? undefined : 2}>
          <Text style={{ fontWeight: '700' }}>{postUserName} </Text>
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
            <View key={idx} style={styles.hashtag}>
              <Text style={styles.hashtagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default React.memo(PostCaption);
