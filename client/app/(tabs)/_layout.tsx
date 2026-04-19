import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, useFocusEffect, useRouter, usePathname, useSegments } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View, FlatList, Modal, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '../../hooks/useNotifications';
import { notificationService } from '../../lib/notificationService';
import { getPushNotificationToken, requestNotificationPermissions, savePushToken } from '../../services/notificationService';
import { getAllStoriesForFeed, getUserProfile } from "../../lib/firebaseHelpers/index";
import { DEFAULT_AVATAR_URL } from "../../lib/api";
import { useLocalSearchParams } from "expo-router";
import { AppBrandMark } from '@/src/_components/AppBrandMark';
import GroupsDrawer from '@/src/_components/GroupsDrawer';
import NotificationsModal from '@/src/_components/NotificationsModal';
import StoriesRow from '@/src/_components/StoriesRow';
import StoriesViewer from '@/src/_components/StoriesViewer';

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { logAnalyticsEvent, setAnalyticsUserId } from '../../lib/analytics';
import { getUserConversations } from '../../lib/firebaseHelpers/conversation';
import { getUserNotifications } from '../../lib/firebaseHelpers/notification';
import { logoutUser } from '@/src/_services/firebaseAuthService';
import fetchLogoUrl from '@/src/_services/brandingService';
import { getNotificationDisplayText } from '../../lib/notificationText';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;
const isLargeDevice = SCREEN_WIDTH >= 414;
const ICON_SIZE = isSmallDevice ? 18 : (isLargeDevice ? 22 : 20);
const CHEVRON_SIZE = isSmallDevice ? 18 : 20;

const TAB_ACTIVE_COLOR = '#0A3D62';
const TAB_INACTIVE_COLOR = '#000000';
const TAB_LABEL_SIZE = 11;
const TOP_MENU_HEIGHT = isSmallDevice ? 50 : 56;

// Create a context for tab events
const TabEventContext = createContext<{ emitHomeTabPress: () => void; subscribeHomeTabPress: (cb: () => void) => () => void } | undefined>(undefined);

type HeaderVisibilityApi = {
  hideHeader: () => void;
  showHeader: () => void;
  headerHeight: number;
  headerScrollY?: Animated.Value;
};

const HeaderVisibilityContext = createContext<HeaderVisibilityApi | undefined>(undefined);

export const useHeaderVisibility = (): HeaderVisibilityApi => {
  const ctx = useContext(HeaderVisibilityContext);
  if (!ctx) {
    return {
      hideHeader: () => { },
      showHeader: () => { },
      headerHeight: 0,
    };
  }
  return ctx;
};

export const useHeaderHeight = (): number => {
  const insets = useSafeAreaInsets();
  return (isSmallDevice ? 50 : 56) + Math.max(insets.top, 12);
};

export const useTabEvent = () => useContext(TabEventContext);

export default function TabsLayout() {
  // Simple subscription system for home tab press
  const homeTabPressListeners = useRef<(() => void)[]>([]);
  const emitHomeTabPress = () => {
    homeTabPressListeners.current.forEach(cb => cb());
  };
  const subscribeHomeTabPress = (cb: () => void) => {
    homeTabPressListeners.current.push(cb);
    return () => {
      homeTabPressListeners.current = homeTabPressListeners.current.filter(fn => fn !== cb);
    };
  };
  const router = useRouter();
  const pathname = usePathname();
  const [menuVisible, setMenuVisible] = useState(false);
  const [groupsDrawerVisible, setGroupsDrawerVisible] = useState(false);
  const [showStoriesViewer, setShowStoriesViewer] = useState(false);
  const [selectedStories, setSelectedStories] = useState<any[]>([]);
  const [storyInitialIndex, setStoryInitialIndex] = useState(0);
  const [storiesRefreshTrigger, setStoriesRefreshTrigger] = useState(0);
  const [storiesRowResetTrigger, setStoriesRowResetTrigger] = useState(0);
  const [storyMedia, setStoryMedia] = useState<{ uri: string; type: string } | null>(null);
  const params = useLocalSearchParams();
  const openedStoryIdRef = useRef<string | null>(null);
  const isSearchScreen = pathname === '/search' || pathname.includes('/search');
  const isSavedScreen = pathname === '/saved' || pathname.includes('/saved');
  const isHomeScreen = pathname === '/home' || pathname === '/' || pathname.includes('home');
  const hideTopOverlay = isSearchScreen || isSavedScreen;
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 12);
  const totalHeaderHeight = TOP_MENU_HEIGHT + safeTop;

  /** Standard-height bottom bar (content ~56pt) + safe inset; sync with floating UI `bottom`. */
  const bottomTabLayout = useMemo(() => {
    const bottomTabSafe = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 10);
    const contentMin = 64;
    const height = contentMin + bottomTabSafe;
    return { bottomTabSafe, height };
  }, [insets.bottom]);

  const tabBarStyle = useMemo(
    () => ({
      height: bottomTabLayout.height,
      paddingBottom: bottomTabLayout.bottomTabSafe,
      paddingTop: 6,
      paddingHorizontal: 12,
      backgroundColor: '#FFFFFF',
      borderTopWidth: 0,
      borderTopColor: 'transparent' as const,
      elevation: 0,
      shadowOpacity: 0,
    }),
    [bottomTabLayout.bottomTabSafe, bottomTabLayout.height]
  );

  const headerScrollY = useRef(new Animated.Value(0)).current;

  const hideHeader = useCallback(() => {
    // Static header: do nothing.
  }, []);

  const showHeader = useCallback(() => {
    // Static header: do nothing.
  }, [headerScrollY]);

  const headerVisibilityValue = useMemo(() => {
    return { hideHeader, showHeader, headerHeight: totalHeaderHeight, headerScrollY };
  }, [hideHeader, showHeader, totalHeaderHeight, headerScrollY]);

  // Handle media returning from story-creator screen
  useEffect(() => {
    const uri = params?.storyMediaUri != null ? String(params.storyMediaUri) : '';
    const type = params?.storyMediaType != null ? String(params.storyMediaType) : 'photo';
    if (!uri) return;
    setStoryMedia({ uri, type });
  }, [params?.storyMediaUri, params?.storyMediaType]);

  // Handle storyId deep-link (moved from home.tsx)
  useEffect(() => {
    const storyIdParam = params?.storyId != null ? String(params.storyId) : '';
    if (!storyIdParam) return;

    if (openedStoryIdRef.current === storyIdParam) return;
    openedStoryIdRef.current = storyIdParam;

    (async () => {
      try {
        const normalizeRemoteUrl = (value: any): string => {
          if (typeof value !== 'string') return '';
          const trimmed = value.trim();
          if (!trimmed) return '';
          const lower = trimmed.toLowerCase();
          if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
          if (lower.startsWith('http://')) return `https://${trimmed.slice(7)}`;
          if (lower.startsWith('//')) return `https:${trimmed}`;
          return trimmed;
        };

        const res = await getAllStoriesForFeed();
        if (!res?.success || !Array.isArray(res.data)) return;

        const now = Date.now();
        const activeStories = res.data.filter((s: any) => {
          if (s?.expiresAt == null) return true;
          return Number(s.expiresAt) > now;
        });

        const target = activeStories.find((s: any) => {
          const id = s?._id || s?.id;
          return id != null && String(id) === storyIdParam;
        });
        if (!target) return;

        const ownerId = typeof target?.userId === 'string'
          ? target.userId
          : String(target?.userId?._id || target?.userId?.id || target?.userId?.uid || target?.userId?.firebaseUid || '');
        if (!ownerId) return;

        let ownerAvatar = DEFAULT_AVATAR_URL;
        try {
          const profileRes: any = await getUserProfile(ownerId);
          if (profileRes?.success && profileRes?.data) {
            ownerAvatar = normalizeRemoteUrl(profileRes.data.avatar || profileRes.data.photoURL || profileRes.data.profilePicture) || DEFAULT_AVATAR_URL;
          }
        } catch (err) {
          console.error('[Layout] Avatar fetch error:', err);
        }

        const ownerStoriesRaw = activeStories.filter((s: any) => {
          const sid = typeof s?.userId === 'string'
            ? s.userId
            : String(s?.userId?._id || s?.userId?.id || s?.userId?.uid || s?.userId?.firebaseUid || '');
          return sid === ownerId;
        });
        const transformed = ownerStoriesRaw.map((story: any) => ({
          ...story,
          id: story._id || story.id,
          userId: ownerId,
          userName: story.userName || 'Anonymous',
          userAvatar: ownerAvatar,
          imageUrl: normalizeRemoteUrl(story.image || story.imageUrl || story.mediaUrl),
          videoUrl: normalizeRemoteUrl(story.video || story.videoUrl),
          mediaType: (story.video || story.videoUrl || story.mediaType === 'video') ? 'video' : 'image'
        }));

        const idx = Math.max(0, transformed.findIndex((s: any) => String(s?.id || '') === storyIdParam));
        if (transformed.length === 0) return;

        setSelectedStories(transformed);
        setStoryInitialIndex(idx);
        setShowStoriesViewer(true);
      } catch (e) {
        console.log('[Layout] Failed to open story deep-link:', e);
      }
    })();
  }, [params?.storyId]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Non-sticky header: part of layout flow (not absolute overlay) */}
      {!hideTopOverlay && (
        <View style={{ height: totalHeaderHeight, overflow: 'hidden' }}>
          <TopMenu setMenuVisible={setMenuVisible} setGroupsDrawerVisible={setGroupsDrawerVisible} />
        </View>
      )}

      <HeaderVisibilityContext.Provider value={headerVisibilityValue}>
        <TabEventContext.Provider value={{ emitHomeTabPress, subscribeHomeTabPress }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              // Header is now in-flow and animates its own height.
              sceneStyle: {
                backgroundColor: '#fff',
                paddingTop: 0,
              },
              tabBarActiveTintColor: TAB_ACTIVE_COLOR,
              tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
              tabBarShowLabel: true,
              tabBarItemStyle: {
                flex: 1,
                justifyContent: 'flex-start',
                paddingTop: 4,
              },
              tabBarLabelStyle: {
                fontSize: TAB_LABEL_SIZE,
                marginTop: 2,
                marginBottom: 10,
              },
              tabBarIconStyle: {
                marginTop: -2,
              },
              lazy: true,
              freezeOnBlur: true,
              tabBarStyle,
            }}
          >
            <Tabs.Screen
              name="home"
              listeners={{
                tabPress: () => {
                  emitHomeTabPress();
                  logAnalyticsEvent('tab_home_press', {});
                },
              }}
              options={{
                title: "Home",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                  marginBottom: 10,
                },
                tabBarIcon: ({ color, focused }) => (
                  <MaterialCommunityIcons
                    name={focused ? 'home' : 'home-outline'}
                    size={ICON_SIZE + 4}
                    color={color}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="search"
              listeners={{
                tabPress: () => {
                  logAnalyticsEvent('tab_search_press', {});
                },
              }}
              options={{
                title: "Search",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                  marginBottom: 10,
                },
                tabBarIcon: ({ color }) => (
                  <Ionicons name="search" size={ICON_SIZE + 2} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="post"
              listeners={{
                tabPress: (e) => {
                  e.preventDefault();
                  logAnalyticsEvent('tab_post_press', {});
                  router.push('/create-post');
                },
              }}
              options={{
                title: "Post",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                  marginBottom: 10,
                },
                tabBarIcon: ({ color }) => (
                  <Ionicons name="add" size={ICON_SIZE + 6} color={TAB_INACTIVE_COLOR} />
                ),
              }}
            />
            <Tabs.Screen
              name="map"
              listeners={{
                tabPress: () => {
                  logAnalyticsEvent('tab_map_press', {});
                },
              }}
              options={{
                title: "Map",
                tabBarButton: () => null,
                tabBarItemStyle: {
                  display: 'none',
                },
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons name={focused ? "map" : "map-outline"} size={ICON_SIZE} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="saved"
              listeners={{
                tabPress: (e) => {
                  e.preventDefault();
                  logAnalyticsEvent('tab_saved_press', {});
                  // Force navigate to the base route without params
                  router.replace('/(tabs)/saved');
                },
              }}
              options={{
                title: "Saved",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                  marginBottom: 10,
                },
                tabBarIcon: ({ color }) => (
                  <Feather
                    name="bookmark"
                    size={ICON_SIZE + 2}
                    color={color}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              listeners={{
                tabPress: () => {
                  logAnalyticsEvent('tab_profile_press', {});
                },
              }}
              options={{
                title: "Profile",
                tabBarLabelStyle: {
                  fontSize: TAB_LABEL_SIZE,
                  fontWeight: '600',
                  marginTop: 2,
                  marginBottom: 10,
                },
                tabBarIcon: ({ color, focused }) => (
                  <Ionicons
                    name={focused ? 'person-circle' : 'person-circle-outline'}
                    size={ICON_SIZE + 2}
                    color={color}
                  />
                ),
              }}
            />
          </Tabs>
        </TabEventContext.Provider>
      </HeaderVisibilityContext.Provider>

      {/* Stories Floating Bar above Tab Bar (Only on Home) */}
      {(pathname === '/home' || pathname === '/') && (
        <View
          style={[
            styles.floatingStoriesContainer,
            { bottom: bottomTabLayout.height + 6 },
          ]}
        >
          <StoriesRow
            onStoryPress={(stories, initialIndex) => {
              setSelectedStories(stories);
              setStoryInitialIndex(initialIndex || 0);
              setShowStoriesViewer(true);
            }}
            onStoryViewerClose={() => {
              setShowStoriesViewer(false);
              setSelectedStories([]);
              setStoryInitialIndex(0);
              setStoriesRowResetTrigger(prev => prev + 1);
            }}
            refreshTrigger={storiesRefreshTrigger}
            resetTrigger={storiesRowResetTrigger}
            incomingMedia={storyMedia}
          />
        </View>
      )}

      {showStoriesViewer && (
        <Modal
          visible={showStoriesViewer}
          animationType="fade"
          onRequestClose={() => {
            setShowStoriesViewer(false);
            setSelectedStories([]);
            setStoryInitialIndex(0);
            setStoriesRowResetTrigger(prev => prev + 1);
          }}
        >
          <StoriesViewer
            stories={selectedStories}
            initialIndex={storyInitialIndex}
            onClose={() => {
              setShowStoriesViewer(false);
              setSelectedStories([]);
              setStoryInitialIndex(0);
              setStoriesRowResetTrigger(prev => prev + 1);
            }}
          />
        </Modal>
      )}


      {/* Modern clean bottom sheet for settings/activity */}
      {menuVisible && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity
            style={{ flex: 1, width: '100%' }}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          />
          <View style={{ width: '100%' }}>
            <View style={[styles.igSheet, { paddingBottom: Math.max(insets.bottom, isSmallDevice ? 24 : 32) + 12 }]}>
              {/* Handle */}
              <View style={styles.handleContainer}>
                <View style={styles.igHandle} />
              </View>

              {/* Menu Items Container */}
              <View style={styles.menuItemsContainer}>
                {/* Settings Group */}
                <View style={styles.menuGroup}>
                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_settings'); setMenuVisible(false); router.push('/settings'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="settings" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Settings</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>
                </View>

                {/* Content Group */}
                <View style={styles.menuGroup}>
                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_saved'); setMenuVisible(false); router.push('/saved'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="bookmark" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Saved Posts</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>
                </View>

                {/* Legal Group */}
                <View style={styles.menuGroup}>
                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_privacy'); setMenuVisible(false); router.push('/legal/privacy'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="shield" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Privacy Policy</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>

                  <View style={styles.separator} />

                  <TouchableOpacity
                    style={styles.igItem}
                    activeOpacity={0.7}
                    onPress={() => { logAnalyticsEvent('open_terms'); setMenuVisible(false); router.push('/legal/terms'); }}
                  >
                    <View style={styles.iconContainer}>
                      <Feather name="file-text" size={ICON_SIZE} color="#667eea" />
                    </View>
                    <Text style={styles.igText}>Terms of Service</Text>
                    <Feather name="chevron-right" size={CHEVRON_SIZE} color="#ccc" style={styles.chevron} />
                  </TouchableOpacity>
                </View>

                {/* Logout Button */}
                <TouchableOpacity
                  style={styles.igItemLogout}
                  activeOpacity={0.7}
                  onPress={async () => {
                    setMenuVisible(false);
                    try {
                      logAnalyticsEvent('logout');
                      // Import and use actual logout function
                      const { logoutUser } = await import('@/src/_services/firebaseAuthService');
                      const result = await logoutUser();
                      if (result.success) {
                        console.log('Logged out successfully');
                        router.replace('/auth/welcome');
                      } else {
                        Alert.alert('Error', 'Logout failed');
                      }
                    } catch (error) {
                      console.error('Logout error:', error);
                      Alert.alert('Error', 'Failed to log out. Please try again.');
                    }
                  }}
                >
                  <View style={[styles.iconContainer, { backgroundColor: '#fee' }]}>
                    <Feather name="log-out" size={ICON_SIZE} color="#e74c3c" />
                  </View>
                  <Text style={styles.igTextLogout}>Log Out</Text>
                </TouchableOpacity>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.cancelButton}
                  activeOpacity={0.7}
                  onPress={() => { logAnalyticsEvent('close_menu'); setMenuVisible(false); }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Groups Drawer */}
      <GroupsDrawer visible={groupsDrawerVisible} onClose={() => setGroupsDrawerVisible(false)} />
    </View>
  );
}

function TopMenu({ setMenuVisible, setGroupsDrawerVisible }: { setMenuVisible: (v: boolean) => void; setGroupsDrawerVisible: (v: boolean) => void }): React.ReactElement {
  const router = useRouter();
  const tabEvents = useTabEvent();
  const insets = useSafeAreaInsets();
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [unreadMsg, setUnreadMsg] = useState(0);

  const [notificationsModalVisible, setNotificationsModalVisible] = React.useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const segments = useSegments();
  const isProfileScreen = segments[segments.length - 1] === 'profile';
  const isHomeScreen = segments[segments.length - 1] === 'home';

  // Get notifications from hook
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead } = useNotifications(currentUserId || '');

  const renderCountBadge = useCallback((count: number, bgColor: string, top: number, right: number) => {
    if (!count || count <= 0) return null;
    const display = count > 99 ? '99+' : String(count);
    const isWide = display.length >= 3;
    const height = isSmallDevice ? 14 : 16;
    const minWidth = isWide ? (isSmallDevice ? 20 : 22) : (isSmallDevice ? 14 : 16);

    return (
      <View
        style={{
          position: 'absolute',
          top,
          right,
          backgroundColor: bgColor,
          height,
          minWidth,
          paddingHorizontal: isWide ? 4 : 3,
          borderRadius: height / 2,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          borderWidth: 1,
          borderColor: '#fff',
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            color: '#fff',
            fontWeight: '800',
            fontSize: isSmallDevice ? (isWide ? 8 : 9) : (isWide ? 9 : 10),
            lineHeight: height - 2,
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
          }}
          numberOfLines={1}
        >
          {display}
        </Text>
      </View>
    );
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        if (isMounted && uid) setCurrentUserId(String(uid));
      } catch { }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!currentUserId) return;
      try {
        const perm = await requestNotificationPermissions();
        if (!perm?.success) return;
        const tokenRes = await getPushNotificationToken();
        if (!tokenRes?.success || !tokenRes?.token) return;
        await savePushToken(currentUserId, tokenRes.token);
      } catch { }
    })();
    return () => { isMounted = false; };
  }, [currentUserId]);

  useEffect(() => {
    const u = currentUserId;
    if (u) setAnalyticsUserId(u);
  }, [currentUserId]);

  useEffect(() => {
    let isMounted = true;
    fetchLogoUrl().then((url: string | null) => {
      if (isMounted) {
        setLogoUrl(url);
        setLogoLoading(false);
      }
    }).catch(() => setLogoLoading(false));
    return () => { isMounted = false; };
  }, []);

  // Refresh badge counts when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      async function fetchCounts() {
        const userId = currentUserId;
        if (!userId) return;
        // Notifications
        try {
          await fetchNotifications();
        } catch { }
        // Messages
        const msgRes = await getUserConversations(userId);
        if (Array.isArray(msgRes)) {
          const unreadMsgs = msgRes.reduce((sum: number, convo: any) => sum + (convo.unread || 0), 0);
          setUnreadMsg(unreadMsgs);
        }
      }
      fetchCounts();
    }, [currentUserId])
  );

  const getNotificationNavRoute = (item: any) => {
    const type = String(item?.type || '');
    if (type === 'follow' || type === 'follow-request' || type === 'follow-approved' || type === 'new-follower') {
      if (item?.senderId) return `/user-profile/${item?.senderId}`;
      return '/(tabs)/home';
    }
    if (type === 'like' || type === 'comment' || type === 'mention' || type === 'tag') {
      if (item?.postId) {
        if (type === 'comment' && item?.commentId) return `/post-detail?id=${item.postId}&commentId=${item.commentId}`;
        return `/post-detail?id=${item.postId}`;
      }
      return '/(tabs)/home';
    }
    if (type === 'message' || type === 'dm') return `/dm?otherUserId=${item?.senderId}`;
    if (type === 'live') {
      if (item?.streamId) return `/watch-live?roomId=${encodeURIComponent(String(item.streamId))}`;
      return '/(tabs)/map';
    }
    if (type === 'story' || type === 'story-mention' || type === 'story-reply') {
      if (item?.storyId) return `/(tabs)/home?storyId=${encodeURIComponent(String(item.storyId))}`;
      return '/(tabs)/home';
    }
    return `/user-profile/${item?.senderId}`;
  };


  return (
    <View style={[styles.topMenu, { paddingTop: Math.max(insets.top, 12), height: (isSmallDevice ? 50 : 56) + Math.max(insets.top, 12) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 150 }}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', height: 40, justifyContent: 'center' }}
          activeOpacity={0.85}
          onPress={() => {
            tabEvents?.emitHomeTabPress?.();
            if (!isHomeScreen) {
              router.replace('/(tabs)/home');
            }
          }}
        >
          <AppBrandMark
            logoUri={logoUrl || undefined}
            size="sm"
            showWordmark
            iconAsset="app"
            variant="tabBar"
          />
        </TouchableOpacity>
      </View>
      {isProfileScreen ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <TouchableOpacity style={styles.topBtn} onPress={() => { logAnalyticsEvent('open_passport'); router.push('/passport' as any); }}>
            <Feather name="briefcase" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={async () => { logAnalyticsEvent('open_notifications'); setNotificationsModalVisible(true); try { await markAllAsRead(); await fetchNotifications({ force: true }); } catch { } }}>
            <Feather name="bell" size={20} color="#000" />
            {renderCountBadge(unreadCount, '#ff3b30', isSmallDevice ? -4 : -6, isSmallDevice ? -4 : -6)}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topBtn, { zIndex: 101 }]} onPress={() => { logAnalyticsEvent('open_menu'); setMenuVisible(true); }}>
            <Feather name="more-vertical" size={20} color="#000" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <TouchableOpacity style={styles.topBtn} onPress={() => { logAnalyticsEvent('open_passport'); router.push('/passport' as any); }}>
            <Feather name="briefcase" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={() => { logAnalyticsEvent('open_inbox'); router.push('/inbox' as any); }}>
            <Feather name="message-square" size={20} color="#000" />
            {renderCountBadge(unreadMsg, '#0A3D62', -4, -4)}
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={async () => { logAnalyticsEvent('open_notifications'); setNotificationsModalVisible(true); try { await markAllAsRead(); await fetchNotifications({ force: true }); } catch { } }}>
            <Feather name="bell" size={20} color="#000" />
            {renderCountBadge(unreadCount, '#ff3b30', -4, -4)}
          </TouchableOpacity>
          {/* Three-dot → Groups Drawer */}
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => { logAnalyticsEvent('open_groups_drawer'); setGroupsDrawerVisible(true); }}
          >
            <Feather name="more-vertical" size={20} color="#333" />
          </TouchableOpacity>
        </View>
      )}

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={async () => {
          setNotificationsModalVisible(false);
          try { await fetchNotifications({ force: true }); } catch { }
        }}
      />


      {/* Mini stream overlay removed as per request */}
    </View>
  );
}

const styles = StyleSheet.create({
  topMenu: {
    height: isSmallDevice ? 50 : 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isSmallDevice ? 12 : 14,
  },
  floatingStoriesContainer: {
    position: 'absolute',
    bottom: 0,
    left: 12, 
    maxWidth: SCREEN_WIDTH - 40, 
    paddingVertical: 5, 
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.5)', // Premium transparent white
    borderRadius: 40, // Perfect pill shape
    zIndex: 90,
    borderWidth: 1.5, 
    borderColor: 'rgba(255, 255, 255, 0.4)', // Reflective border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  logo: {
    fontSize: isSmallDevice ? 14 : (isLargeDevice ? 17 : 16),
    fontWeight: '700'
  },
  logoImg: {
    height: isSmallDevice ? 40 : 54,
    width: isSmallDevice ? 130 : 170,
    marginVertical: 2,
    marginLeft: 2,
    marginRight: 2,
  },
  topBtn: {
    padding: isSmallDevice ? 2 : 4,
    position: 'relative',
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 999,
  },
  igSheet: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderTopLeftRadius: isSmallDevice ? 18 : 24,
    borderTopRightRadius: isSmallDevice ? 18 : 24,
    paddingTop: isSmallDevice ? 40 : 48,
    paddingBottom: isSmallDevice ? 24 : 32,
    maxHeight: SCREEN_HEIGHT * 0.85,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  igHandle: {
    width: isSmallDevice ? 32 : 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  menuItemsContainer: {
    paddingHorizontal: isSmallDevice ? 12 : 16,
    paddingTop: isSmallDevice ? 8 : 12,
  },
  menuGroup: {
    backgroundColor: '#fff',
    borderRadius: isSmallDevice ? 10 : 12,
    marginBottom: isSmallDevice ? 10 : 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  igItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 12 : 14,
    paddingHorizontal: isSmallDevice ? 14 : 16,
    backgroundColor: '#fff',
  },
  iconContainer: {
    width: isSmallDevice ? 32 : (isLargeDevice ? 40 : 36),
    height: isSmallDevice ? 32 : (isLargeDevice ? 40 : 36),
    borderRadius: isSmallDevice ? 16 : (isLargeDevice ? 20 : 18),
    backgroundColor: '#f0f3ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isSmallDevice ? 10 : 12,
  },
  igText: {
    flex: 1,
    color: '#1f2937',
    fontSize: isSmallDevice ? 14 : (isLargeDevice ? 17 : 16),
    fontWeight: '500',
  },
  chevron: {
    marginLeft: 'auto',
  },
  separator: {
    height: 0.5,
    backgroundColor: '#e5e7eb',
    marginLeft: isSmallDevice ? 54 : (isLargeDevice ? 68 : 64),
  },
  igItemLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 12 : 14,
    paddingHorizontal: isSmallDevice ? 14 : 16,
    backgroundColor: '#fff',
    borderRadius: isSmallDevice ? 10 : 12,
    marginBottom: isSmallDevice ? 10 : 12,
    shadowColor: '#e74c3c',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  igTextLogout: {
    flex: 1,
    color: '#e74c3c',
    fontSize: isSmallDevice ? 14 : (isLargeDevice ? 17 : 16),
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderRadius: isSmallDevice ? 10 : 12,
    paddingVertical: isSmallDevice ? 14 : 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cancelText: {
    color: '#6b7280',
    fontSize: isSmallDevice ? 15 : (isLargeDevice ? 17 : 16),
    fontWeight: '600',
  },
  notificationsModal: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: isSmallDevice ? 50 : 60,
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  notificationsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  notificationsList: {
    paddingVertical: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 4,
  },
  notificationType: {
    fontSize: 12,
    color: '#0A3D62',
    fontWeight: '600',
    marginBottom: 2,
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0A3D62',
    marginLeft: 8,
  },
  emptyNotifications: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyNotificationsText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  miniOverlay: {
    position: 'absolute',
    bottom: isSmallDevice ? 90 : 100,
    right: isSmallDevice ? 12 : 16,
    width: isSmallDevice ? 160 : 180,
    height: isSmallDevice ? 280 : 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 10,
    zIndex: 1000,
  },
  miniHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  miniBtn: { padding: 4 },
});
