import React from 'react';
import { Modal, Pressable, TouchableOpacity, View, Text, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Dimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import HighlightViewer from '@/src/_components/HighlightViewer';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CommentSection from '@/src/_components/CommentSection';
import { CollectionsModal, UserMenuModal } from '@/src/_components/profile/ProfileModals';
import PostViewerModal from '@/src/_components/PostViewerModal';
import EditSectionsModal from '@/src/_components/EditSectionsModal';
import { UploadStoryModal } from '@/src/_components/profile/UploadStoryModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProfileModalsProps {
  // Collections
  viewCollectionsModal: boolean;
  setViewCollectionsModal: (val: boolean) => void;
  sections: any[];
  selectedSection: string | null;
  setSelectedSection: (val: string | null) => void;

  // Post Viewer
  postViewerVisible: boolean;
  setPostViewerVisible: (val: boolean) => void;
  currentPostsArray: any[];
  selectedPostIndex: number;
  profile: any;
  currentUserId: string | null;
  currentUserFirebaseAlias?: string;
  likedPosts: Record<string, boolean>;
  savedPosts: Record<string, boolean>;
  handleLikePost: (postId: string) => void;
  handleSavePost: (post: any) => void;
  handleSharePost: (post: any) => void;
  setCommentModalPostId: (id: string) => void;
  setCommentModalAvatar: (url: string) => void;
  setCommentModalVisible: (val: boolean) => void;
  avatarPreviewUri: string | null;
  setAvatarPreviewUri: (uri: string | null) => void;
  isOwnProfile: boolean;
  handleAvatarPick: () => void;

  // Comments
  commentModalVisible: boolean;
  commentModalPostId: string;
  commentModalAvatar: string;
  posts: any[];
  getKeyboardOffset: () => number;
  getModalHeight: (ratio: number) => number;

  // Edit Sections
  viewedUserId: string | null;
  editSectionsModal: boolean;
  setEditSectionsModal: (val: boolean) => void;
  refetchAll: () => Promise<void>;

  // User Menu
  userMenuVisible: boolean;
  setUserMenuVisible: (val: boolean) => void;
  handleBlockUser: (name: string) => void;
  handleReportUser: () => void;
  shareProfile: (data: any) => void;

  // Story Upload
  showUploadModal: boolean;
  setShowUploadModal: (val: boolean) => void;
  selectedMedia: any;
  setSelectedMedia: (val: any) => void;
  locationQuery: string;
  setLocationQuery: (val: string) => void;
  locationSuggestions: any[];
  setLocationSuggestions: (val: any[]) => void;
  uploading: boolean;
  setUploading: (val: boolean) => void;
  uploadProgress: number;
  setUploadProgress: (val: number) => void;
  showSuccess: (msg: string) => void;

  // Highlights
  highlightViewerVisible: boolean;
  setHighlightViewerVisible: (val: boolean) => void;
  selectedHighlightId: string | null;

  userStories: any[];
}

const ProfileModals: React.FC<ProfileModalsProps> = (props) => {
  const insets = useSafeAreaInsets();
  const {
    viewCollectionsModal, setViewCollectionsModal, sections, selectedSection, setSelectedSection,
    postViewerVisible, setPostViewerVisible, currentPostsArray, selectedPostIndex, profile, currentUserId, currentUserFirebaseAlias,
    likedPosts, savedPosts, handleLikePost, handleSavePost, handleSharePost, setCommentModalPostId, setCommentModalAvatar, setCommentModalVisible,
    avatarPreviewUri, setAvatarPreviewUri, isOwnProfile, handleAvatarPick,
    commentModalVisible, commentModalPostId, commentModalAvatar, posts, getKeyboardOffset, getModalHeight,
    viewedUserId, editSectionsModal, setEditSectionsModal, refetchAll,
    userMenuVisible, setUserMenuVisible, handleBlockUser, handleReportUser, shareProfile,
    showUploadModal, setShowUploadModal, selectedMedia, setSelectedMedia, locationQuery, setLocationQuery, locationSuggestions, setLocationSuggestions,
    uploading, setUploading, uploadProgress, setUploadProgress, showSuccess,
    highlightViewerVisible, setHighlightViewerVisible, selectedHighlightId,
    userStories
  } = props;

  React.useEffect(() => {
    console.log('[ProfileModals] 🚀 Component MOUNTED! highlightViewerVisible:', highlightViewerVisible);
    return () => {
      console.log('[ProfileModals] 💀 Component UNMOUNTED!');
    };
  }, []);

  React.useEffect(() => {
    console.log('[ProfileModals] 🔄 highlightViewerVisible or selectedHighlightId changed:', { highlightViewerVisible, selectedHighlightId });
  }, [highlightViewerVisible, selectedHighlightId]);

  return (
    <>
      {/* Collections View Sheet */}
      <CollectionsModal
        visible={viewCollectionsModal}
        onClose={() => setViewCollectionsModal(false)}
        sections={sections}
        selectedSection={selectedSection}
        onSelectSection={setSelectedSection}
      />

      {/* Instagram-style Post Viewer */}
      {React.createElement(PostViewerModal as any, {
        visible: postViewerVisible,
        onClose: () => setPostViewerVisible(false),
        posts: currentPostsArray,
        selectedPostIndex: selectedPostIndex,
        profile: profile,
        authUser: currentUserId ? { _id: currentUserId, id: currentUserId, uid: currentUserId, firebaseUid: currentUserFirebaseAlias } : null,
        likedPosts: likedPosts,
        savedPosts: savedPosts,
        handleLikePost: (post: any) => handleLikePost(post?.id || post?._id || ''),
        handleSavePost: handleSavePost,
        title: "Post",
        handleSharePost: handleSharePost,
        setCommentModalPostId: (id: any) => setCommentModalPostId(id || ''),
        setCommentModalAvatar: setCommentModalAvatar,
        setCommentModalVisible: setCommentModalVisible,
      })}

      {/* Full-screen profile photo (Instagram-style) */}
      <Modal
        visible={!!avatarPreviewUri}
        transparent
        animationType="fade"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setAvatarPreviewUri(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAvatarPreviewUri(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setAvatarPreviewUri(null)}
            style={[styles.closeButton, { top: Math.max(insets.top, 12) + 4 }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={34} color="#fff" />
          </TouchableOpacity>
          {!!avatarPreviewUri && (
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.avatarPreviewContainer}>
              <ExpoImage
                source={{ uri: avatarPreviewUri }}
                style={{
                  width: Math.min(SCREEN_WIDTH - 32, SCREEN_HEIGHT * 0.72),
                  height: Math.min(SCREEN_WIDTH - 32, SCREEN_HEIGHT * 0.72),
                }}
                contentFit="contain"
                transition={150}
                cachePolicy="memory-disk"
              />
            </Pressable>
          )}
          {isOwnProfile && !!avatarPreviewUri && (
            <TouchableOpacity
              style={[styles.changePhotoButton, { bottom: Math.max(insets.bottom, 16) + 8 }]}
              onPress={() => {
                setAvatarPreviewUri(null);
                handleAvatarPick();
              }}
            >
              <Text style={styles.changePhotoText}>Change profile photo</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Modal>

      <Modal visible={commentModalVisible} animationType="slide" transparent={true} onRequestClose={() => setCommentModalVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? getKeyboardOffset() : 0}
        >
          <View style={styles.commentModalContainer}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setCommentModalVisible(false)}
            />
            <View style={[styles.commentSheet, { maxHeight: getModalHeight(0.9) }]}>
              <View style={styles.commentHandleContainer}>
                <View style={styles.commentHandle} />
                <Text style={styles.commentTitle}>Comments</Text>
              </View>
              {!!commentModalPostId && (
                <CommentSection
                  postId={commentModalPostId}
                  postOwnerId={posts.find((p: any) => (p.id || p._id) === commentModalPostId)?.userId || ''}
                  currentAvatar={commentModalAvatar}
                  currentUser={currentUserId ? { uid: currentUserId } : undefined}
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit sections modal */}
      {viewedUserId && (
        <EditSectionsModal
          visible={editSectionsModal}
          onClose={() => setEditSectionsModal(false)}
          userId={viewedUserId}
          currentUserId={currentUserId || ''}
          sections={sections}
          posts={posts}
          onSectionsUpdate={() => refetchAll()}
        />
      )}

      {/* User Menu Modal (for other users' profiles) - Block, Report options */}
      <UserMenuModal
        visible={userMenuVisible}
        onClose={() => setUserMenuVisible(false)}
        isOwnProfile={isOwnProfile}
        onBlock={() => handleBlockUser(profile?.name || profile?.displayName || 'this user')}
        onReport={handleReportUser}
        onShare={() => {
          setUserMenuVisible(false);
          shareProfile({
            userId: String(viewedUserId || ''),
            name: typeof profile?.name === 'string' ? profile.name : (typeof profile?.displayName === 'string' ? profile.displayName : ''),
            username: typeof profile?.username === 'string' ? profile.username : ''
          });
        }}
      />

      {/* Story Upload Modal */}
      <UploadStoryModal
        visible={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setSelectedMedia(null);
          setLocationQuery('');
          setLocationSuggestions([]);
        }}
        selectedMedia={selectedMedia}
        setSelectedMedia={setSelectedMedia}
        currentUserId={currentUserId}
        locationQuery={locationQuery}
        setLocationQuery={setLocationQuery}
        locationSuggestions={locationSuggestions}
        setLocationSuggestions={setLocationSuggestions}
        uploading={uploading}
        setUploading={setUploading}
        uploadProgress={uploadProgress}
        setUploadProgress={setUploadProgress}
        showSuccess={showSuccess}
      />

      <HighlightViewer
        visible={highlightViewerVisible}
        highlightId={selectedHighlightId}
        onClose={() => {
          console.log('[ProfileModals] 🛑 onClose triggered from inside HighlightViewer! Stack trace:\n', new Error().stack);
          setHighlightViewerVisible(false);
        }}
        userId={isOwnProfile ? (currentUserId || undefined) : undefined}
        userName={profile?.displayName || profile?.name}
        userAvatar={profile?.avatar || profile?.photoURL || undefined}
      />
    </>
  );
};

export default ProfileModals;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    padding: 8
  },
  avatarPreviewContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  changePhotoButton: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  changePhotoText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15
  },
  commentModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  commentSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  commentHandleContainer: {
    alignItems: 'center',
    marginBottom: 8
  },
  commentHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    marginBottom: 8
  },
  commentTitle: {
    fontWeight: '700',
    fontSize: 17,
    color: '#222'
  }
});
