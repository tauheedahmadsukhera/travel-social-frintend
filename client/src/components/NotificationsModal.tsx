import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@/lib/storage';
import { useNotifications } from '../../hooks/useNotifications';
import { notificationService } from '@/src/services/notificationService';
import { getNotificationDisplayText } from '../../lib/notificationText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;
const isLargeDevice = SCREEN_WIDTH >= 414;

interface NotificationsModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function NotificationsModal({ visible, onClose }: NotificationsModalProps) {
    const router = useRouter();
    const [currentUserId, setCurrentUserId] = useState<string>('');

    const { notifications, fetchNotifications, markAsRead } = useNotifications(currentUserId || '');

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
        if (visible && currentUserId) {
            fetchNotifications();
        }
    }, [visible, currentUserId]);

    const getNotificationNavRoute = (item: any) => {
        const type = String(item?.type || '');
        if (type === 'follow' || type === 'follow-request' || type === 'follow-approved' || type === 'new-follower') {
            if (item?.senderId) return `/user-profile/${item?.senderId}`;
            return '/(tabs)/home';
        } else if (type === 'like' || type === 'tag' || type === 'mention') {
            if (item?.postId) return `/post-detail?id=${item.postId}`;
            return '/(tabs)/home';
        } else if (type === 'comment') {
            if (item?.postId) return `/post-detail?id=${item.postId}&commentId=${item?.commentId || ''}`;
            return '/(tabs)/home';
        } else if (type === 'dm' || type === 'message') {
            if (item?.senderId) return `/dm?otherUserId=${item.senderId}`;
            return '/inbox';
        } else if (type === 'live') {
            return '/(tabs)/map';
        } else if (type === 'story' || type === 'story-mention' || type === 'story-reply') {
            if (item?.storyId && String(item.storyId).trim()) {
                return `/(tabs)/home?storyId=${encodeURIComponent(String(item.storyId))}`;
            } else {
                return '/(tabs)/home';
            }
        } else {
            if (item?.senderId) return `/user-profile/${item.senderId}`;
            return '/(tabs)/home';
        }
    };

    const renderNotificationItem = (item: any) => (
        <TouchableOpacity
            style={styles.notificationItem}
            onPress={async () => {
                try { await markAsRead(item._id); } catch { }
                try { onClose(); } catch { }
                try { router.push(getNotificationNavRoute(item) as any); } catch { }
            }}
        >
            <View style={styles.notificationContent}>
                <Text style={styles.notificationMessage}>{getNotificationDisplayText(item)}</Text>
                <Text style={styles.notificationTime}>
                    {new Date(item.createdAt).toLocaleDateString()}
                </Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
    );

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={async () => {
                onClose();
                try { await fetchNotifications(); } catch { }
            }}
        >
            <View style={styles.notificationsModal}>
                <View style={styles.notificationsHeader}>
                    <Text style={styles.notificationsTitle}>Notifications</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Feather name="x" size={24} color="#333" />
                    </TouchableOpacity>
                </View>

                {notifications.length > 0 ? (
                    <FlatList
                        data={notifications}
                        keyExtractor={(item) => item._id}
                        renderItem={({ item }) => renderNotificationItem(item)}
                        contentContainerStyle={styles.notificationsList}
                        removeClippedSubviews
                        windowSize={7}
                        maxToRenderPerBatch={12}
                        initialNumToRender={12}
                    />
                ) : (
                    <View style={styles.emptyNotifications}>
                        <Feather name="bell-off" size={48} color="#ccc" />
                        <Text style={styles.emptyNotificationsText}>No notifications yet</Text>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
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
        paddingRight: 8,
    },
    notificationMessage: {
        fontSize: 14,
        fontWeight: '500',
        color: '#1f2937',
        marginBottom: 4,
        flexShrink: 1,
        flexWrap: 'wrap',
    },
    notificationTime: {
        fontSize: 12,
        color: '#999',
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
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FF8D00',
        marginLeft: 8,
    },
});
