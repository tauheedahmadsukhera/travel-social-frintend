import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../_services/apiService';
import { resolveCanonicalUserId } from '../../lib/currentUser';

// Hooks
import { useCollectionLogic, Collection } from '../../hooks/useCollectionLogic';

// Components
import { CollectionListScreen } from './collections/CollectionListScreen';
import { NewCollectionScreen } from './collections/NewCollectionScreen';
import { VisibilitySettingsScreen } from './collections/VisibilitySettingsScreen';
import { InviteCollaboratorsScreen } from './collections/InviteCollaboratorsScreen';

const { height: SCREEN_H } = Dimensions.get('window');
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
    initialScreen?: Screen;
}

export default function SaveToCollectionModal({ 
    visible, onClose, postId, postImageUrl, currentUserId, onSaveChange, initialGloballySaved = true, onCollectionCreated, initialScreen = 'list' 
}: Props) {
    const insets = useSafeAreaInsets();
    const sheetTranslateY = useRef(new Animated.Value(0)).current;
    const [currentUid, setCurrentUid] = useState<string | null>(currentUserId || null);
    const [screen, setScreen] = useState<Screen>('list');

    // Resolve currentUid from prop or resolveCanonicalUserId
    useEffect(() => {
        if (currentUserId) {
            setCurrentUid(currentUserId);
        } else {
            resolveCanonicalUserId().then((uid) => {
                if (uid) setCurrentUid(uid);
            }).catch(() => {});
        }
    }, [currentUserId]);

    // Logic Hook
    const {
        collections,
        loadingCollections,
        isUpdating,
        saving,
        loadCollections,
        togglePostInCollection,
        createCollection,
        setCollections,
    } = useCollectionLogic(postId, currentUid);

    // Local State for Screens
    const [isGloballySaved, setIsGloballySaved] = useState(initialGloballySaved);
    const [newName, setNewName] = useState('');
    const [newVisibility, setNewVisibility] = useState<'public' | 'private' | 'specific'>('private');
    const [newCollaborators, setNewCollaborators] = useState<any[]>([]);
    const [tempSelectedGroups, setTempSelectedGroups] = useState<string[]>([]);
    const [tempSelectedCollaborators, setTempSelectedCollaborators] = useState<any[]>([]);
    const [followerSearch, setFollowerSearch] = useState('');
    const [followers, setFollowers] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [loadingFollowers, setLoadingFollowers] = useState(false);
    const [groups, setGroups] = useState<any[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [toast, setToast] = useState({ visible: false, message: '' });
    const toastAnim = useRef(new Animated.Value(0)).current;
    const nameInputRef = useRef<TextInput>(null);

    const [keyboardHeight, setKeyboardHeight] = useState(0);

    // Adjust for keyboard appearance to keep modal visible
    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
            setKeyboardHeight(e.endCoordinates?.height || 0);
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const showToast = useCallback((message: string) => {
        setToast({ visible: true, message });
        Animated.sequence([
            Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setToast({ visible: false, message: '' }));
    }, [toastAnim]);

    const handleModalClose = useCallback((skipAnimate = false) => {
        const inAnyCollection = collections.some(c => c.postIds?.includes(postId));
        onSaveChange?.(isGloballySaved || inAnyCollection);
        if (skipAnimate) { onClose(); return; }
        Animated.timing(sheetTranslateY, { toValue: SCREEN_H, duration: 280, useNativeDriver: true }).start(onClose);
    }, [collections, postId, isGloballySaved, onSaveChange, onClose, sheetTranslateY]);

    useEffect(() => {
        if (visible) {
            setScreen(initialScreen);
            setNewName('');
            setNewVisibility('private');
            setNewCollaborators([]);
            setTempSelectedGroups([]);
            setIsGloballySaved(initialGloballySaved);
            loadCollections();
            sheetTranslateY.setValue(0);
        }
    }, [visible, initialScreen, initialGloballySaved, loadCollections, sheetTranslateY]);

    // If currentUid was not available when modal first opened, reload collections when it becomes available
    useEffect(() => {
        if (visible && currentUid) {
            loadCollections();
        }
    }, [currentUid]);

    const handleGlobalToggle = async () => {
        if (!currentUid || isUpdating) return;
        const nextState = !isGloballySaved;
        setIsGloballySaved(nextState);
        try {
            if (nextState) await apiService.post(`/users/${currentUid}/saved`, { postId });
            else await apiService.delete(`/users/${currentUid}/saved/${postId}`);
            
            // Emit update to sync all UI states
            try {
                const { feedEventEmitter } = require('../../lib/feedEventEmitter');
                feedEventEmitter.emitPostUpdated(postId, { isSaved: nextState });
            } catch (err) {
                console.warn('[SaveToCollectionModal] failed to emit global toggle update:', err);
            }

            showToast(nextState ? 'Saved to All' : 'Removed from Saved');
        } catch { setIsGloballySaved(!nextState); }
    };

    const Header = ({ title, onLeft, leftLabel = 'Cancel', rightLabel = 'Save', onRight, rightDisabled = false }: any) => (
        <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onLeft || (() => setScreen('list'))}>
                <Text style={styles.headerLeft}>{leftLabel}</Text>
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}><Text style={styles.headerTitle}>{title}</Text></View>
            {onRight ? (
                <TouchableOpacity style={styles.headerBtn} onPress={onRight} disabled={rightDisabled}>
                    <Text style={[styles.headerRight, rightDisabled && styles.headerRightDisabled]}>{rightLabel}</Text>
                </TouchableOpacity>
            ) : <View style={styles.headerBtn} />}
        </View>
    );

    const sheetPanResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => { if (g.dy > 0) sheetTranslateY.setValue(g.dy); },
        onPanResponderRelease: (_, g) => {
            if (g.dy > 120 || g.vy > 0.5) handleModalClose();
            else Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true }).start();
        }
    })).current;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={() => { Keyboard.dismiss(); handleModalClose(); }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                <View style={styles.backdrop}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { Keyboard.dismiss(); handleModalClose(); }} />
                    <Animated.View 
                        style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }], paddingBottom: insets.bottom || 20 }]}
                    >
                    <View style={styles.dragBarContainer} {...sheetPanResponder.panHandlers}>
                        <View style={styles.dragBar} />
                    </View>
                    {screen === 'list' && (
                        <CollectionListScreen
                            collections={collections} loading={loadingCollections} postId={postId}
                            postImageUrl={postImageUrl} isGloballySaved={isGloballySaved}
                            onGlobalToggle={handleGlobalToggle} onToggleCollection={(id) => togglePostInCollection(id, showToast)}
                            onGoToNew={() => { setScreen('new'); setTimeout(() => nameInputRef.current?.focus(), 350); }}
                            onClose={() => handleModalClose()} insets={insets} Header={Header}
                        />
                    )}
                    {screen === 'new' && (
                        <NewCollectionScreen
                            postImageUrl={postImageUrl} newName={newName} setNewName={setNewName}
                            newVisibility={newVisibility} newCollaborators={newCollaborators}
                            tempSelectedGroups={tempSelectedGroups} groups={groups}
                            onGoToVisibility={async () => {
                                  setScreen('visibility');
                                  if (groups.length === 0) {
                                      setLoadingGroups(true);
                                      const res = await apiService.get(`/groups?userId=${currentUid}`);
                                      if (res?.success) setGroups(res.data);
                                      setLoadingGroups(false);
                                  }
                              }}
                              onGoToInvite={async () => {
                                  setScreen('invite');
                                  setTempSelectedCollaborators([...newCollaborators]);
                                  if (followers.length === 0) {
                                      setLoadingFollowers(true);
                                      const res = await apiService.get(`/follow/users/${currentUid}/followers`);
                                      setFollowers(res?.data || []);
                                      setLoadingFollowers(false);
                                  }
                              }}
                              onCreateCollection={async () => {
                                  const created = await createCollection({
                                      name: newName, visibility: newVisibility, coverImage: postImageUrl,
                                      collaborators: newCollaborators.map(u => u._id || u.firebaseUid),
                                      allowedGroups: tempSelectedGroups
                                  });
                                  if (created) {
                                      onCollectionCreated?.(created);
                                      handleModalClose(true);
                                  }
                              }}
                              onGoBack={() => setScreen('list')} saving={saving} nameInputRef={nameInputRef} Header={Header}
                          />
                      )}
                      {screen === 'visibility' && (
                          <VisibilitySettingsScreen
                              currentVisibility={newVisibility} onConfirm={(v) => { setNewVisibility(v); if (v !== 'specific') setScreen('new'); }}
                              groups={groups} tempSelectedGroups={tempSelectedGroups} loadingGroups={loadingGroups}
                              onToggleGroup={(g) => {
                                  setTempSelectedGroups(prev => prev.includes(g._id) ? prev.filter(id => id !== g._id) : [...prev, g._id]);
                              }}
                              onGoBack={() => setScreen('new')} Header={Header}
                          />
                      )}
                      {screen === 'invite' && (
                          <InviteCollaboratorsScreen
                              followerSearch={followerSearch} setFollowerSearch={setFollowerSearch}
                              followers={followers} searchResults={searchResults} searching={searching}
                              loadingFollowers={loadingFollowers} tempSelectedCollaborators={tempSelectedCollaborators}
                              onToggleCollaborator={(u) => {
                                  setTempSelectedCollaborators(prev => prev.some(su => (su._id || su.firebaseUid) === (u._id || u.firebaseUid))
                                      ? prev.filter(su => (su._id || su.firebaseUid) !== (u._id || u.firebaseUid)) : [...prev, u]);
                              }}
                              onConfirm={() => { setNewCollaborators(tempSelectedCollaborators); setScreen('new'); }}
                              onGoBack={() => setScreen('new')} Header={Header}
                          />
                      )}
                      </Animated.View>

                    {toast.visible && (
                        <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                            <Text style={styles.toastText}>{toast.message}</Text>
                        </Animated.View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
      );
  }
  
  const styles = StyleSheet.create({
      backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', overflow: 'visible' },
      sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: SCREEN_H * 0.75, maxHeight: SCREEN_H * 0.92 },
      dragBarContainer: { width: '100%', height: 30, alignItems: 'center', justifyContent: 'center' },
      dragBar: { width: 40, height: 5, backgroundColor: '#ddd', borderRadius: 3, alignSelf: 'center' },
      header: { flexDirection: 'row', alignItems: 'center', height: 56 },
      headerBtn: { width: 130, paddingHorizontal: 16, justifyContent: 'center' },
      headerLeft: { fontSize: 15, color: '#666' },
      headerRight: { fontSize: 15, color: '#FF8D00', fontWeight: '700', textAlign: 'right' },
      headerRightDisabled: { color: '#ccc' },
      headerTitleWrap: { flex: 1, alignItems: 'center' },
      headerTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
      toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
      toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  });
