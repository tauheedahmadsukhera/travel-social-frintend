/**
 * SaveToCollectionModal
 * 4-screen bottom sheet: list → new → visibility → invite
 */
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../_services/apiService';
import { feedEventEmitter } from '../../lib/feedEventEmitter';
import { resolveCanonicalUserId } from '../../lib/currentUser';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface Collection {
    _id: string;
    name: string;
    coverImage?: string;
    postIds: string[];
    visibility: 'public' | 'private' | 'specific';
    collaborators: { userId: string }[];
    userId: string; // owner
}

interface User {
    _id: string;
    firebaseUid: string;
    displayName: string;
    name?: string;
    uid?: string;
    avatar?: string;
    username?: string;
}

type Screen = 'list' | 'new' | 'visibility' | 'invite';

interface Props {
    visible: boolean;
    onClose: () => void;
    postId: string;
    postImageUrl?: string;
    currentUserId?: string;
    onSaveChange?: (saved: boolean) => void;
    initialGloballySaved?: boolean;
    onCollectionCreated?: (collection: Collection) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SaveToCollectionModal({ visible, onClose, postId, postImageUrl, currentUserId, onSaveChange, initialGloballySaved = true, onCollectionCreated }: Props) {
    const insets = useSafeAreaInsets();
    const sheetTranslateY = useRef(new Animated.Value(0)).current;
    // Ref so PanResponder (created once) always calls the latest close handler
    const handleModalCloseRef = useRef<() => void>(() => {});
    const sheetPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_evt, gesture) => {
                return gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
            },
            onPanResponderMove: (_evt, gesture) => {
                if (gesture.dy > 0) sheetTranslateY.setValue(gesture.dy);
            },
            onPanResponderRelease: (_evt, gesture) => {
                const shouldClose = gesture.dy > 100 || gesture.vy > 0.5;
                if (shouldClose) {
                    Animated.timing(sheetTranslateY, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }).start(() => {
                        sheetTranslateY.setValue(0);
                        handleModalCloseRef.current();
                    });
                } else {
                    Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
            },
        })
    ).current;

    // Screen
    const [screen, setScreen] = useState<Screen>('list');

    // Collections list
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loadingCollections, setLoadingCollections] = useState(false);

    // New collection form
    const [newName, setNewName] = useState('');
    const [newVisibility, setNewVisibility] = useState<'public' | 'private' | 'specific'>('private');
    const [newCollaborators, setNewCollaborators] = useState<User[]>([]);
    const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Invite screen
    const [followers, setFollowers] = useState<User[]>([]);
    const [followerSearch, setFollowerSearch] = useState('');
    const [loadingFollowers, setLoadingFollowers] = useState(false);
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [searching, setSearching] = useState(false);
    // Groups screen
    const [groups, setGroups] = useState<any[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [tempSelectedGroups, setTempSelectedGroups] = useState<string[]>([]);
    const [tempSelectedCollaborators, setTempSelectedCollaborators] = useState<User[]>([]);

    const [isUpdating, setIsUpdating] = useState(false);
    const nameInputRef = useRef<TextInput>(null);
    const [currentUid, setCurrentUid] = useState<string | null>(null);

    const [isGloballySaved, setIsGloballySaved] = useState(initialGloballySaved);
    const didAutoGlobalSaveRef = useRef(false);
    // Toast logic
    const [toast, setToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
    const toastAnim = useRef(new Animated.Value(0)).current;

    const showToast = (message: string) => {
        setToast({ visible: true, message });
        Animated.sequence([
            Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setToast({ visible: false, message: '' }));
    };

    // Close handler that syncs the final save state before dismissing
    const handleModalClose = useCallback(() => {
        const inAnyCollection = collections.some(c => c.postIds?.includes(postId));
        const finalSaved = isGloballySaved || inAnyCollection;
        onSaveChange?.(finalSaved);
        // Smooth slide-down before closing
        Animated.timing(sheetTranslateY, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }).start(() => {
            sheetTranslateY.setValue(0);
            onClose();
        });
    }, [collections, postId, isGloballySaved, onSaveChange, onClose, sheetTranslateY]);

    // Keep ref updated so PanResponder always calls the latest version
    useEffect(() => {
        handleModalCloseRef.current = handleModalClose;
    }, [handleModalClose]);

    // Load canonical userId once on mount
    useEffect(() => {
        if (currentUserId) {
            setCurrentUid(currentUserId);
            return;
        }

        let mounted = true;
        (async () => {
            const resolved = await resolveCanonicalUserId();
            if (!mounted) return;
            setCurrentUid(resolved);
        })();

        return () => {
            mounted = false;
        };
    }, [currentUserId]);

    // ── Load on open ──────────────────────────────────────────────────────────



    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (followerSearch.trim().length > 1) {
                setSearching(true);
                try {
                    const res = await apiService.get(`/users/search?q=${encodeURIComponent(followerSearch)}&requesterUserId=${currentUid}`);
                    if (res?.success && Array.isArray(res.data)) {
                        const normalized = res.data.map((u: any) => ({
                            ...u,
                            uid: u._id || u.firebaseUid,
                            name: u.displayName || u.name || 'User',
                            avatar: u.avatar || u.photoURL || u.profilePicture || ''
                        }));
                        setSearchResults(normalized);
                    }
                } catch (e) {
                    console.error('[SaveToCollectionModal] search error', e);
                } finally {
                    setSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [followerSearch, currentUid]);

    const loadCollections = useCallback(async () => {
        if (!currentUid) return;
        setLoadingCollections(true);
        try {
            const res = await apiService.get(`/users/${currentUid}/sections`, {
                requesterUserId: currentUid,
                requesterId: currentUid,
                viewerId: currentUid,
            });
            if (res?.success && Array.isArray(res.data)) setCollections(res.data);
            else setCollections([]);
        } catch {
            setCollections([]);
        } finally {
            setLoadingCollections(false);
        }
    }, [currentUid]);

    const loadFollowers = useCallback(async () => {
        if (!currentUid) return;
        setLoadingFollowers(true);
        try {
            const res = await apiService.get(`/users/${currentUid}/followers`);
            const list = res?.data || res || [];
            setFollowers(Array.isArray(list) ? list : []);
        } catch {
            setFollowers([]);
        } finally {
            setLoadingFollowers(false);
        }
    }, [currentUid]);

    const loadGroups = useCallback(async () => {
        if (!currentUid) return;
        setLoadingGroups(true);
        try {
            const res = await apiService.get(`/groups?userId=${currentUid}`);
            if (res?.success && Array.isArray(res.data)) setGroups(res.data);
            else setGroups([]);
        } catch {
            setGroups([]);
        } finally {
            setLoadingGroups(false);
        }
    }, [currentUid]);

    // ── Load on open ──────────────────────────────────────────────────────────

    useEffect(() => {
        if (visible) {
            setScreen('list');
            setNewName('');
            setNewVisibility('private');
            setNewCollaborators([]);
            setAllowedUsers([]);
            setTempSelectedCollaborators([]);
            setTempSelectedGroups([]);
            // Only sync initialGloballySaved on fresh open, not when it changes mid-session
            setIsGloballySaved(initialGloballySaved);
            didAutoGlobalSaveRef.current = false;
            loadCollections();
            loadGroups();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, loadCollections, loadGroups]);

    // Auto-save to "All" ONLY once when modal opens and post is not saved anywhere.
    // Uses a ref to read isGloballySaved so changes to it don't re-trigger this effect.
    const isGloballySavedRef = useRef(isGloballySaved);
    isGloballySavedRef.current = isGloballySaved;

    useEffect(() => {
        if (!visible) return;
        if (!currentUid) return;
        if (!postId) return;
        if (didAutoGlobalSaveRef.current) return;
        if (loadingCollections) return;

        // Mark as handled FIRST so this never runs again during this session
        didAutoGlobalSaveRef.current = true;

        // If already saved globally or in any collection, skip
        if (isGloballySavedRef.current) return;
        const inAnyCollection = collections.some(c => c.postIds?.includes(postId));
        if (inAnyCollection) return;

        (async () => {
            try {
                await apiService.post(`/users/${currentUid}/saved`, { postId });
                setIsGloballySaved(true);
                showToast('Saved to All');
                syncGlobalState(true, collections);
            } catch (e) {
                console.error('[SaveToCollectionModal] auto global save error', e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, currentUid, postId, loadingCollections, collections]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const syncGlobalState = (globSaved: boolean, cols: Collection[]) => {
        if (!onSaveChange) return;
        const inAnyCollection = cols.some(c => c.postIds?.includes(postId));
        onSaveChange(globSaved || inAnyCollection);
    };

    const togglePostInCollection = async (collectionId: string) => {
        if (!currentUid || isUpdating) return;
        
        const col = collections.find(c => c._id === collectionId);
        if (!col) return;
        
        const isCurrentlySaved = col.postIds?.includes(postId);
        setIsUpdating(true);

        try {
            console.log('[SaveToCollectionModal] Toggling post:', postId, 'in collection:', collectionId, 'currentlySaved:', isCurrentlySaved);
            const body = {
                ...(isCurrentlySaved ? { removePostId: postId } : { addPostId: postId }),
                requesterUserId: currentUid,
                viewerId: currentUid,
            };
            const res = await apiService.put(`/users/${currentUid}/sections/${collectionId}`, body);
            
            if (res?.success) {
                const updatedCols = collections.map(c => 
                    c._id === collectionId 
                    ? { ...c, postIds: isCurrentlySaved 
                        ? (c.postIds || []).filter(id => id !== postId) 
                        : [...(c.postIds || []), postId] 
                      } 
                    : c
                );
                setCollections(updatedCols);
                syncGlobalState(isGloballySaved, updatedCols);
                showToast(isCurrentlySaved ? `Removed from ${col.name}` : `Saved to ${col.name}`);
            } else {
                Alert.alert('Error', 'Failed to update collection');
            }
        } catch (e) {
            console.error('[SaveToCollectionModal] toggle error', e);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleGlobalToggle = async () => {
        if (!currentUid || isUpdating) return;
        setIsUpdating(true);
        const nextState = !isGloballySaved;
        try {
            if (nextState) {
                // Add to global saved
                await apiService.post(`/users/${currentUid}/saved`, { postId });
                showToast('Saved to All');
            } else {
                // Remove from global saved
                await apiService.delete(`/users/${currentUid}/saved/${postId}`);
                showToast('Removed from Saved');
            }
            setIsGloballySaved(nextState);
            syncGlobalState(nextState, collections);
        } catch (e) {
            console.error('[SaveToCollectionModal] handleGlobalToggle error', e);
        } finally {
            setIsUpdating(false);
        }
    };

    const createCollection = async () => {
        if (!currentUid || !newName.trim()) return;
        setSaving(true);
        let createdSuccessfully = false;
        try {
            const res = await apiService.post(`/users/${currentUid}/sections`, {
                name: newName.trim(),
                postIds: postId ? [postId] : [],
                coverImage: postImageUrl || undefined,
                visibility: newVisibility,
                collaborators: newCollaborators.map(u => u.uid || u.firebaseUid || u._id),
                allowedUsers: allowedUsers,
                allowedGroups: tempSelectedGroups,
                requesterUserId: currentUid,
                viewerId: currentUid,
            });
            if (res?.success) {
                const createdCollection = (res?.data || res?.section || null) as Collection | null;
                if (createdCollection?._id) {
                    setCollections(prev => [createdCollection, ...prev.filter(c => c._id !== createdCollection._id)]);
                    onCollectionCreated?.(createdCollection);
                }
                await loadCollections();
                if (postId) {
                    onSaveChange?.(true);
                }
                feedEventEmitter.emit('feedUpdated');
                createdSuccessfully = true;
            } else {
                Alert.alert('Error', res?.error || 'Failed to create collection');
            }
        } catch (e) {
            console.error('createCollection error', e);
            Alert.alert('Error', 'Failed to create collection');
        } finally {
            setSaving(false);
        }

        if (createdSuccessfully) {
            onClose();
        }
    };

    // ── Screen transitions ────────────────────────────────────────────────────

    const goToNew = () => {
        setScreen('new');
        setTimeout(() => nameInputRef.current?.focus(), 350);
    };

    const goToVisibility = () => setScreen('visibility');

    const goToInvite = () => {
        console.log('[SaveToCollectionModal] 🙋 Navigating to Invite screen');
        setTempSelectedCollaborators([...newCollaborators]);
        setFollowerSearch('');
        setScreen('invite');
        loadFollowers();
    };

    const confirmInvite = () => {
        Keyboard.dismiss();
        setNewCollaborators([...tempSelectedCollaborators]);
        setScreen('new');
    };

    const confirmVisibility = (v: 'public' | 'private' | 'specific') => {
        Keyboard.dismiss();
        setNewVisibility(v);
        // If specific, we stay on a sub-screen or update something?
        // Actually, if 'specific' is clicked, we'll show groups in the same renderVisibility or a sub-section
        if (v !== 'specific') setScreen('new');
    };

    const toggleGroup = (group: any) => {
        const gid = group._id;
        setTempSelectedGroups(prev => {
            const exists = prev.some(sid => String(sid) === String(gid));
            const next = exists 
                ? prev.filter(sid => String(sid) !== String(gid)) 
                : [...prev, String(gid)];
            
            // Sync allowedUsers
            let allMembers: string[] = [];
            groups.filter(g => next.some(sid => String(sid) === String(g._id))).forEach(g => {
                if (Array.isArray(g.members)) allMembers = [...allMembers, ...g.members];
            });
            setAllowedUsers([...new Set(allMembers)]);
            
            return next;
        });
    };

    const goBack = () => {
        Keyboard.dismiss();
        if (screen === 'new') setScreen('list');
        else if (screen === 'visibility' || screen === 'invite') setScreen('new');
        else handleModalClose();
    };

    // ── Render helpers ────────────────────────────────────────────────────────

    const isSaved = (col: Collection) => col.postIds?.includes(postId);

    const isSameUser = (u1: any, u2: any) => {
        if (!u1 || !u2) return false;
        if (typeof u1 === 'string' && typeof u2 === 'string') return u1 === u2;
        
        const getIds = (u: any) => {
            if (typeof u === 'string') return [u];
            return [
                u._id ? String(u._id) : null,
                u.id ? String(u.id) : null,
                u.uid ? String(u.uid) : null,
                u.firebaseUid ? String(u.firebaseUid) : null
            ].filter(Boolean);
        };
        const ids1 = getIds(u1);
        const ids2 = getIds(u2);
        return ids1.some(id => ids2.includes(id));
    };

    const toggleTempCollab = (user: User) => {
        setTempSelectedCollaborators(prev => {
            const exists = prev.some(u => isSameUser(u, user));
            if (exists) {
                return prev.filter(u => !isSameUser(u, user));
            }
            return [...prev, user];
        });
    };


    // ─── Common header ────────────────────────────────────────────────────────

    const Header = ({ title, onLeft, leftLabel = 'Cancel', rightLabel = 'Save', onRight, rightDisabled = false, showDragBar = true, titleOnLeft = false }: {
        title: string;
        onLeft?: () => void;
        leftLabel?: string;
        rightLabel?: string;
        onRight?: () => void;
        rightDisabled?: boolean;
        showDragBar?: boolean;
        titleOnLeft?: boolean;
    }) => (
        <View style={styles.header}>
            <TouchableOpacity
                style={[styles.headerBtn, { alignItems: 'flex-start' }]}
                onPress={onLeft || goBack}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <Text style={styles.headerLeft}>{leftLabel}</Text>
            </TouchableOpacity>
            
            <View style={styles.headerTitleWrap}>
                <Text style={[styles.headerTitle, titleOnLeft && { textAlign: 'left', marginLeft: 10 }]}>{title}</Text>
            </View>

            {onRight ? (
                <TouchableOpacity
                    style={[styles.headerBtn, { alignItems: 'flex-end' }]}
                    onPress={onRight}
                    disabled={rightDisabled}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Text style={[styles.headerRight, rightDisabled && styles.headerRightDisabled]}>{rightLabel}</Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.headerBtn} />
            )}
        </View>
    );

    // Keyboard background fix
    const KeyboardBackground = () => (
        <View style={{ position: 'absolute', bottom: -1000, left: 0, right: 0, height: 1000, backgroundColor: '#fff' }} />
    );

    // ─── Screen: list ────────────────────────────────────────────────────────

    const renderList = () => (
        <>
            <Header
                title="Collection"
                leftLabel="Cancel"
                rightLabel="New collection"
                onLeft={handleModalClose}
                onRight={goToNew}
            />

            <View style={styles.savedToAllRow}>
                <View style={styles.savedToAllThumb}>
                    {postImageUrl ? (
                        <ExpoImage source={{ uri: postImageUrl }} style={styles.collThumbImg} contentFit="cover" />
                    ) : (
                        <View style={[styles.collThumbImg, styles.collThumbPlaceholder]}>
                            <Feather name="bookmark" size={20} color="#666" />
                        </View>
                    )}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.savedToAllTitle}>Saved</Text>
                    <Text style={styles.savedToAllSub}>Private</Text>
                </View>
                <TouchableOpacity onPress={handleGlobalToggle} style={{ padding: 4 }}>
                    <Ionicons name={isGloballySaved ? "bookmark" : "bookmark-outline"} size={24} color={isGloballySaved ? "#0A3D62" : "#999"} />
                </TouchableOpacity>
            </View>

            <View style={styles.collectionsDivider} />
            <Text style={styles.collectionsLabel}>Collections</Text>

            <View style={{ flex: 1 }}>
                {loadingCollections ? (
                    <View style={styles.center}>
                        <ActivityIndicator color="#0A3D62" />
                    </View>
                ) : collections.length === 0 ? (
                    // ── Empty state ──
                    <View style={[styles.emptyState, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
                        <View style={styles.emptyIconWrap}>
                            <Feather name="bookmark" size={36} color="#0A3D62" />
                        </View>
                        <Text style={styles.emptyTitle}>Organize the post you love</Text>
                        <Text style={styles.emptySubtitle}>
                            Save posts and pictures just for you or to share with others.
                        </Text>
                        <TouchableOpacity style={styles.emptyBtn} onPress={goToNew} activeOpacity={0.8}>
                            <Text style={styles.emptyBtnText}>Create your first collection</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    // ── Collections list ──
                    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
                        <View style={styles.collectionsList}>
                            {collections.map(col => (
                                <TouchableOpacity
                                    key={col._id}
                                    style={styles.collRow}
                                    onPress={() => togglePostInCollection(col._id)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.collThumb}>
                                        {col.coverImage ? (
                                            <ExpoImage
                                                source={{ uri: col.coverImage }}
                                                style={styles.collThumbImg}
                                                contentFit="cover"
                                            />
                                        ) : (
                                            <View style={[styles.collThumbImg, styles.collThumbPlaceholder]}>
                                                <Feather name="folder" size={24} color="#ccc" />
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.collName}>{col.name}</Text>
                                    {isSaved(col) ? (
                                        <Ionicons name="checkmark-circle" size={24} color="#0A3D62" />
                                    ) : (
                                        <Ionicons name="add-circle-outline" size={24} color="#ccc" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                )}
            </View>
        </>
    );

    // ─── Screen: new ─────────────────────────────────────────────────────────

    const renderNew = () => (
        <>
            <Header
                title="New collection"
                onLeft={() => setScreen('list')}
                onRight={createCollection}
                rightDisabled={saving || !newName.trim()}
                rightLabel={saving ? '...' : 'Save'}
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Post thumbnail */}
                {postImageUrl ? (
                    <View style={styles.newPostThumbContainer}>
                        <ExpoImage
                            source={{ uri: postImageUrl }}
                            style={styles.newPostThumb}
                            contentFit="cover"
                        />
                    </View>
                ) : (
                    <View style={[styles.newPostThumbContainer, styles.collThumbPlaceholder]}>
                        <Feather name="image" size={40} color="#ccc" />
                    </View>
                )}

                {/* Name input */}
                <View style={styles.newInputContainer}>
                    <TextInput
                        ref={nameInputRef}
                        style={styles.newNameInput}
                        placeholder="Collection name"
                        placeholderTextColor="#999"
                        value={newName}
                        onChangeText={setNewName}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                    />
                    {newName.length > 0 && (
                        <TouchableOpacity onPress={() => setNewName('')} style={styles.clearInput}>
                            <Ionicons name="close-circle" size={18} color="#ccc" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Visibility row */}
                <TouchableOpacity style={styles.newOptionRow} onPress={goToVisibility}>
                    <Ionicons name="eye-outline" size={20} color="#444" />
                    <Text style={styles.newOptionLabel}>Visibility</Text>
                    <View style={styles.optionRight}>
                        <Text style={styles.optionValue}>
                            {newVisibility === 'public' ? 'Public' : newVisibility === 'private' ? 'Private' : 'Specific'}
                        </Text>
                        <Feather name="chevron-right" size={18} color="#aaa" />
                    </View>
                </TouchableOpacity>

                {/* Invite row */}
                <TouchableOpacity style={styles.newOptionRow} onPress={goToInvite}>
                    <Ionicons name="person-add-outline" size={20} color="#444" />
                    <Text style={styles.newOptionLabel}>Add people to collection</Text>
                    <Feather name="chevron-right" size={18} color="#aaa" />
                </TouchableOpacity>

                {/* Visibility/Group indicator */}
                {newVisibility === 'specific' && tempSelectedGroups.length > 0 && (
                    <View style={styles.collabInfo}>
                        <Ionicons name="people-outline" size={14} color="#0A3D62" />
                        <Text style={styles.collabChips}>
                            Visible to: {groups.filter(g => tempSelectedGroups.includes(g._id)).map(g => g.name).join(', ')}
                        </Text>
                    </View>
                )}

                {/* Collaborator chips */}
                {newCollaborators.length > 0 && (
                    <View style={styles.collabInfo}>
                        <Ionicons name="person-add-outline" size={14} color="#0A3D62" />
                        <Text style={styles.collabChips}>
                            Collaborators: {newCollaborators.map(u => u.displayName || u.username).join(', ')}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </>
    );

    // ─── Screen: visibility ───────────────────────────────────────────────────

    const renderVisibility = () => {
        const options: { key: 'public' | 'private'; label: string; sub: string }[] = [
            { key: 'public', label: 'Public', sub: 'Anyone can see this collection' },
            { key: 'private', label: 'Private', sub: 'Only you can see this collection' },
        ];
        return (
            <>
                <Header title="Visibility" onLeft={() => setScreen('new')} />
                <ScrollView style={{ flex: 1 }}>
                    {options.map(opt => (
                        <View key={opt.key}>
                            <TouchableOpacity
                                style={styles.radioRow}
                                onPress={() => confirmVisibility(opt.key)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.radioLabel}>{opt.label}</Text>
                                    <Text style={styles.radioSub}>{opt.sub}</Text>
                                </View>
                                <View style={[
                                    styles.radioCircle,
                                    newVisibility === opt.key && styles.radioCircleSelected,
                                ]}>
                                    {newVisibility === opt.key && <View style={styles.radioDot} />}
                                </View>
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </>
        );
    };

    // ─── Screen: invite ───────────────────────────────────────────────────────

    const renderInvite = () => (
        <>
            <Header
                title="Invite"
                onLeft={() => setScreen('new')}
                rightLabel="Save"
                onRight={confirmInvite}
            />
            {/* Search */}
            <View style={[styles.searchWrap, { height: 46, borderRadius: 23, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#eef0f2', marginVertical: 12, paddingHorizontal: 16 }]}>
                <Feather name="search" size={18} color="#0A3D62" style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.searchInput, { fontSize: 15 }]}
                    placeholder="Search people to invite..."
                    placeholderTextColor="#99aab5"
                    value={followerSearch}
                    onChangeText={setFollowerSearch}
                    autoFocus={false}
                />
                {followerSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setFollowerSearch('')}>
                        <Ionicons name="close-circle" size={18} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>
            {searching ? (
                <View style={styles.center}><ActivityIndicator color="#0A3D62" /></View>
            ) : (
                <FlatList
                    data={followerSearch.trim().length > 1 ? searchResults : followers.filter(f => 
                        (f.name || f.username || '').toLowerCase().includes(followerSearch.toLowerCase())
                    )}
                    keyExtractor={u => u._id || u.firebaseUid || u.uid || String(Math.random())}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                        const sel = tempSelectedCollaborators.some(u => isSameUser(u, item));
                        return (
                            <TouchableOpacity style={styles.userRow} onPress={() => toggleTempCollab(item)}>
                                {item.avatar ? (
                                    <ExpoImage source={{ uri: item.avatar }} style={styles.userAvatar} contentFit="cover" />
                                ) : (
                                    <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
                                        <Feather name="user" size={20} color="#ccc" />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.userName}>{item.name || item.username}</Text>
                                    {item.username ? <Text style={styles.userHandle}>@{item.username}</Text> : null}
                                </View>
                                <View style={[styles.radioCircle, sel && styles.radioCircleSelected]}>
                                    {sel && <View style={styles.radioDot} />}
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </>
    );

    // ─── Root render ──────────────────────────────────────────────────────────

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={goBack}
            statusBarTranslucent
            presentationStyle="overFullScreen"
        >
            <TouchableWithoutFeedback
                onPress={() => {
                    Keyboard.dismiss();
                    handleModalClose();
                }}
            >
                <View style={styles.backdrop} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                enabled={Platform.OS === 'ios'}
                style={styles.kavWrapper}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <Animated.View
                    style={[
                        styles.sheet,
                        { paddingBottom: insets.bottom + 8 },
                        { transform: [{ translateY: sheetTranslateY }] },
                    ]}
                >
                    <KeyboardBackground />
                    {/* Drag handle area – swipe down to close */}
                    <View {...sheetPanResponder.panHandlers} style={styles.dragHandleArea}>
                        <View style={styles.dragHandle} />
                    </View>

                    <View style={{ flex: 1 }}>
                        {screen === 'list' && renderList()}
                        {screen === 'new' && renderNew()}
                        {screen === 'visibility' && renderVisibility()}
                        {screen === 'invite' && renderInvite()}
                    </View>

                    {/* Toast Notification */}
                    {toast.visible && (
                        <Animated.View style={[styles.toastContainer, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                            <View style={styles.toast}>
                                <Text style={styles.toastText}>{toast.message}</Text>
                            </View>
                        </Animated.View>
                    )}
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    // Modal structure
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    kavWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: SCREEN_H * 0.9,
        minHeight: 450,
        overflow: 'hidden',
    },
    dragHandleArea: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 8,
        paddingBottom: 8,
    },
    dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#ddd',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    headerDragBar: { flex: 1 },
    headerBtn: { minWidth: 80 },
    headerTitleWrap: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#000',
    },
    headerLeft: {
        fontSize: 15,
        color: '#0A3D62',
        fontWeight: '600',
    },
    headerRight: {
        fontSize: 15,
        color: '#0A3D62',
        fontWeight: '700',
        textAlign: 'right',
    },
    headerRightDisabled: {
        color: '#bbb',
    },

    // Empty state
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingVertical: 24,
    },
    emptyIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#EFF3F8',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 13,
        color: '#888',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 28,
    },
    emptyBtn: {
        backgroundColor: '#0A3D62',
        borderRadius: 10,
        paddingVertical: 14,
        paddingHorizontal: 32,
        width: '100%',
        alignItems: 'center',
    },
    emptyBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },

    // Saved to All Row
    savedToAllRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    savedToAllThumb: {
        width: 44,
        height: 44,
        borderRadius: 8,
        overflow: 'hidden',
        marginRight: 12,
        backgroundColor: '#f0f0f0',
    },
    savedToAllTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#000',
    },
    savedToAllSub: {
        fontSize: 12,
        color: '#888',
        marginTop: 1,
    },
    collectionsDivider: {
        height: 1,
        backgroundColor: '#f2f2f2',
        marginHorizontal: 16,
        marginTop: 4,
    },
    collectionsLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#000',
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 8,
    },

    // Collection row
    collRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f0f0',
    },
    collThumb: {
        width: 52,
        height: 52,
        borderRadius: 10,
        overflow: 'hidden',
        marginRight: 14,
    },
    collThumbImg: {
        width: '100%',
        height: '100%',
    },
    collThumbPlaceholder: {
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    collName: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },

    // New collection screen
    newPostThumbContainer: {
        width: 140,
        height: 140,
        borderRadius: 16,
        alignSelf: 'center',
        marginVertical: 24,
        backgroundColor: '#f9f9f9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    newPostThumb: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
    },
    newInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        paddingVertical: 4,
        marginBottom: 12,
    },
    newNameInput: {
        flex: 1,
        fontSize: 16,
        color: '#000',
        paddingVertical: 12,
    },
    clearInput: {
        padding: 4,
    },
    newOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 12,
    },
    newOptionLabel: {
        flex: 1,
        fontSize: 15,
        color: '#000',
        fontWeight: '500',
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f0f0',
        gap: 12,
    },
    optionLabel: {
        flex: 1,
        fontSize: 14,
        color: '#222',
    },
    optionRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    optionValue: {
        fontSize: 13,
        color: '#888',
    },
    collabInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 8,
        gap: 6,
    },
    collabChips: {
        fontSize: 13,
        color: '#0A3D62',
        fontWeight: '500',
    },

    // Visibility screen
    radioRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f0f0',
    },
    radioLabel: {
        fontSize: 15,
        color: '#111',
        fontWeight: '600',
        marginBottom: 2,
    },
    radioSub: {
        fontSize: 12,
        color: '#999',
    },
    radioCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    radioCircleSelected: {
        borderColor: '#0A3D62',
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#0A3D62',
    },

    // Groups in visibility
    groupSection: {
        backgroundColor: '#fafafa',
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 12,
    },
    groupName: {
        fontSize: 14,
        color: '#444',
    },
    groupNameSelected: {
        color: '#0A3D62',
        fontWeight: '600',
    },
    infoText: {
        fontSize: 12,
        color: '#999',
        fontStyle: 'italic',
        marginVertical: 10,
    },
    doneBtn: {
        backgroundColor: '#0A3D62',
        borderRadius: 8,
        paddingVertical: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    doneBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },

    // Invite screen
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 12,
        backgroundColor: '#f5f7fa',
        borderRadius: 23,
        paddingHorizontal: 16,
        paddingVertical: 8,
        height: 46,
        borderWidth: 1,
        borderColor: '#eef0f2',
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#111',
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f5f5f5',
    },
    userAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
    },
    userAvatarPlaceholder: {
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    userHandle: {
        fontSize: 13,
        color: '#888',
    },

    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },

    // Toast
    toastContainer: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 9999,
    },
    toast: {
        backgroundColor: 'rgba(38, 38, 38, 0.9)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        minWidth: 200,
        alignItems: 'center',
    },
    toastText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    collectionsList: {
        paddingBottom: 20,
    },
});
