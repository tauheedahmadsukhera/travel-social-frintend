/**
 * Component Props Types
 * Reusable component props to avoid 'any' in UI components.
 */

import { Post, User, Story, Highlight, NormalizedMessage } from './models';
import { ViewStyle, TextStyle, ImageStyle } from 'react-native';

export interface BaseProps {
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}

export interface PostCardProps extends BaseProps {
  post: Post;
  onLike?: (postId: string) => void;
  onComment?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onSave?: (postId: string) => void;
  onPressProfile?: (userId: string) => void;
}

export interface MessageBubbleProps extends BaseProps {
  message: NormalizedMessage;
  isMine: boolean;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (message: NormalizedMessage) => void;
  onDelete?: (messageId: string) => void;
  showAvatar?: boolean;
}

export interface AvatarProps extends BaseProps {
  uri?: string;
  size?: number;
  onPress?: () => void;
  showBadge?: boolean;
}

export interface UserRowProps extends BaseProps {
  user: User;
  onPress?: (user: User) => void;
  actionButton?: React.ReactNode;
}
