import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import ProfileGridItem from '@/src/_components/profile/ProfileGridItem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ProfileGridProps {
  posts: any[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  renderHeader: React.ReactElement | (() => React.ReactElement);
  onPressPost: (item: any, index: number) => void;
  normalizeMediaUrl: (url: string) => string;
  isVideoUrl: (url: string) => boolean;
  DEFAULT_IMAGE_URL: string;
  insetsBottom: number;
}

const ProfileGrid: React.FC<ProfileGridProps> = ({
  posts,
  loading,
  refreshing,
  onRefresh,
  renderHeader,
  onPressPost,
  normalizeMediaUrl,
  isVideoUrl,
  DEFAULT_IMAGE_URL,
  insetsBottom
}) => {
  return (
    <FlashList
      data={posts}
      keyExtractor={(item, index) => item.id || item._id || `post-${index}`}
      renderItem={({ item, index }) => (
        <ProfileGridItem
          item={item}
          index={index}
          onPress={onPressPost}
          normalizeMediaUrl={normalizeMediaUrl}
          isVideoUrl={isVideoUrl}
          DEFAULT_IMAGE_URL={DEFAULT_IMAGE_URL}
        />
      )}
      numColumns={3}
      estimatedItemSize={SCREEN_WIDTH / 3}
      ListHeaderComponent={
        // IMPORTANT: wrap in a function component so FlashList always calls it
        // on re-render. Passing a raw ReactElement causes FlashList to cache it
        // and never update the header when state changes (e.g. follower count).
        typeof renderHeader === 'function'
          ? renderHeader
          : () => renderHeader
      }
      ListEmptyComponent={() => (
        !loading && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="grid-outline" size={48} color="#ccc" />
            <Text style={{ marginTop: 10, color: '#999' }}>No posts yet</Text>
          </View>
        )
      )}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insetsBottom + 40 }}
      onRefresh={onRefresh}
      refreshing={refreshing}
      scrollEventThrottle={16}
      removeClippedSubviews={Platform.OS === 'android'}
    />
  );
};

export default ProfileGrid;
