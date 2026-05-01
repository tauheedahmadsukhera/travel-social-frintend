import { safeRouterBack } from '@/lib/safeRouterBack';
/**
 * story-upload.tsx
 * Instagram-style story share screen.
 * Receives: storyMediaUri, storyMediaType, storyTextOverlays (JSON)
 * Lets user add caption + location, then uploads the story.
 */

import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { ResizeMode, Video } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compressVideoSafe, compressImageSafe } from '../lib/mediaUtils';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStory, getCategories } from '../lib/firebaseHelpers/index';
import { apiService } from '@/src/_services/apiService';
import { API_BASE_URL } from '../lib/api';


const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_H = SCREEN_W * 1.2;

type FontStyleKey = 'classic' | 'modern' | 'strong';

type TextOverlay = {
    id: string;
    text: string;
    color: string;
    fontStyle: FontStyleKey;
    x: number;
    y: number;
};

const FONT_STYLES: Record<FontStyleKey, { label: string; fontFamily?: string; letterSpacing?: number; textTransform?: 'uppercase' | 'none' }> = {
    classic: { label: 'Classic', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
    modern: { label: 'Modern', letterSpacing: 1 },
    strong: { label: 'Strong', letterSpacing: 2, textTransform: 'uppercase' },
};

const TEXT_COLORS = [
    '#ffffff', '#000000', '#FFD700', '#FF4444',
    '#44CFFF', '#44FF88', '#FF44CC', '#FF8800',
    '#8B44FF', '#FF6B6B', '#4ECDC4', '#96E6A1',
];

// ─────────────────────────────────────────────
export default function StoryUploadScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();

    const uri = typeof params.storyMediaUri === 'string' ? params.storyMediaUri : '';
    const type = typeof params.storyMediaType === 'string' ? params.storyMediaType : 'photo';
    const overlaysRaw = typeof params.storyTextOverlays === 'string' ? params.storyTextOverlays : '';
    const isPostShareParam = typeof params.isPostShare === 'string' ? params.isPostShare === 'true' : false;
    const postDataRaw = typeof params.postData === 'string' ? params.postData : '';

    const [locationQuery, setLocationQuery] = useState('');
    const [locationData, setLocationData] = useState<any>(null);
    const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [userId, setUserId] = useState<string | null>(null);
    const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
    const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
    const overlayPositionsRef = useRef<Record<string, Animated.ValueXY>>({});
    const [showTextEditor, setShowTextEditor] = useState(false);
    /** When set, Done updates this overlay instead of creating a new one */
    const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const [editingColor, setEditingColor] = useState('#ffffff');
    const [editingFontStyle, setEditingFontStyle] = useState<FontStyleKey>('classic');
    const [visibility, setVisibility] = useState('Everyone');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [userGroups, setUserGroups] = useState<{ _id: string; name: string; type: string; members: string[] }[]>([]);
    const [showVisibilityModal, setShowVisibilityModal] = useState(false);
    const [scrollEnabled, setScrollEnabled] = useState(true);


    // Load current user
    useEffect(() => {
        AsyncStorage.getItem('userId').then(setUserId).catch(() => setUserId(null));
    }, []);

    const fetchGroups = useCallback(async () => {
        try {
            const uid = await AsyncStorage.getItem('userId');
            if (!uid) return;
            const res = await apiService.get(`/groups?userId=${uid}`);
            if (res.success) {
                setUserGroups(res.data || []);
            }
        } catch (e) {
            console.error('[StoryUpload] Fetch groups failed:', e);
        }
    }, [apiService]);

    useFocusEffect(
        useCallback(() => {
            fetchGroups();
        }, [fetchGroups])
    );


    // Location autocomplete
    useEffect(() => {
        if (locationQuery.length < 2) { setLocationSuggestions([]); return; }
        setLoadingLocations(true);
        const timer = setTimeout(async () => {
            try {
                const { mapService } = await import('../services');
                const sug = await mapService.getAutocompleteSuggestions(locationQuery);
                setLocationSuggestions(sug.map((s: any) => ({
                    placeId: s.placeId,
                    name: s.mainText || s.description || 'Location',
                    address: s.description || '',
                })));
            } catch { setLocationSuggestions([]); }
            finally { setLoadingLocations(false); }
        }, 500);
        return () => clearTimeout(timer);
    }, [locationQuery]);

    useEffect(() => {
        try {
            if (overlaysRaw) {
                const parsed = JSON.parse(overlaysRaw);
                if (Array.isArray(parsed)) {
                    setTextOverlays(parsed as TextOverlay[]);
                }
            }
        } catch {
            setTextOverlays([]);
        }
    }, [overlaysRaw]);

    // Ensure each overlay has a stable Animated position
    useEffect(() => {
        const map = overlayPositionsRef.current;
        textOverlays.forEach((o) => {
            if (!map[o.id]) {
                map[o.id] = new Animated.ValueXY({
                    x: (o.x || 0.5) * SCREEN_W,
                    y: (o.y || 0.5) * PREVIEW_H,
                });
            }
        });
        // Cleanup removed overlays
        Object.keys(map).forEach((id) => {
            if (!textOverlays.some((o) => o.id === id)) {
                delete map[id];
            }
        });
    }, [textOverlays]);

    const deleteOverlay = useCallback((id: string) => {
        setTextOverlays((prev) => prev.filter((o) => o.id !== id));
        setSelectedOverlayId((prev) => (prev === id ? null : prev));
        try {
            delete overlayPositionsRef.current[id];
        } catch { }
    }, []);

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const closeTextEditor = useCallback(() => {
        setShowTextEditor(false);
        setEditingOverlayId(null);
    }, []);

    const openTextEditorNew = useCallback(() => {
        setEditingOverlayId(null);
        setEditingText('');
        setEditingColor('#ffffff');
        setEditingFontStyle('classic');
        setShowTextEditor(true);
    }, []);

    const openTextEditorForOverlay = useCallback((overlay: TextOverlay) => {
        const rawFs = overlay.fontStyle as string | undefined;
        const fsKey: FontStyleKey =
            rawFs === 'classic' || rawFs === 'modern' || rawFs === 'strong' ? rawFs : 'classic';
        setEditingOverlayId(overlay.id);
        setEditingText(overlay.text);
        setEditingColor(overlay.color);
        setEditingFontStyle(fsKey);
        setSelectedOverlayId(overlay.id);
        setShowTextEditor(true);
    }, []);

// ─────────────────────────────────────────────
// Draggable text overlay component (Moved outside to prevent re-creation lag)
// ─────────────────────────────────────────────
const DraggableOverlay = ({ 
    overlay, 
    isSelected, 
    pos, 
    onSelect, 
    onDelete, 
    onUpdatePosition,
    setScrollEnabled 
}: { 
    overlay: TextOverlay; 
    isSelected: boolean;
    pos: Animated.ValueXY;
    onSelect: (overlay: TextOverlay) => void;
    onDelete: (id: string) => void;
    onUpdatePosition: (id: string, x: number, y: number) => void;
    setScrollEnabled: (enabled: boolean) => void;
}) => {
    const fs = FONT_STYLES[overlay.fontStyle || 'classic'];
    
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_evt, gesture) =>
                Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
            onPanResponderGrant: () => {
                setScrollEnabled(false);
                onSelect(overlay);
                // @ts-ignore
                pos.extractOffset();
            },
            onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
            onPanResponderRelease: (_evt, gesture) => {
                setScrollEnabled(true);
                pos.flattenOffset();
                // @ts-ignore
                const rawX = (pos.x as any)._value || 0;
                // @ts-ignore
                const rawY = (pos.y as any)._value || 0;

                const nextX = Math.max(10, Math.min(SCREEN_W - 10, rawX));
                const nextY = Math.max(10, Math.min(PREVIEW_H - 10, rawY));
                pos.setValue({ x: nextX, y: nextY });

                onUpdatePosition(overlay.id, nextX / SCREEN_W, nextY / PREVIEW_H);
            },
            onPanResponderTerminate: () => {
                setScrollEnabled(true);
                pos.flattenOffset();
            }
        })
    ).current;

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[
                styles.overlayDragWrap,
                {
                    transform: [
                        { translateX: pos.x },
                        { translateY: pos.y },
                    ],
                },
                isSelected && styles.overlayDragWrapSelected,
            ]}
        >
            <TouchableOpacity
                activeOpacity={1}
                onPress={() => onSelect(overlay)}
            >
                <Text
                    style={[
                        styles.overlayText,
                        {
                            color: overlay.color,
                            fontFamily: fs.fontFamily,
                            letterSpacing: fs.letterSpacing,
                            textTransform: fs.textTransform as any,
                        },
                    ]}
                >
                    {overlay.text}
                </Text>
            </TouchableOpacity>

            {isSelected && (
                <TouchableOpacity
                    style={styles.overlayDeleteBtn}
                    onPress={() => onDelete(overlay.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Feather name="x" size={16} color="#fff" />
                </TouchableOpacity>
            )}
        </Animated.View>
    );
};

    const commitText = () => {
        const trimmed = editingText.trim();
        if (!trimmed) {
            closeTextEditor();
            return;
        }
        if (editingOverlayId) {
            setTextOverlays((prev) =>
                prev.map((o) =>
                    o.id === editingOverlayId
                        ? { ...o, text: trimmed, color: editingColor, fontStyle: editingFontStyle }
                        : o
                )
            );
            closeTextEditor();
            return;
        }
        const overlay: TextOverlay = {
            id: Date.now().toString(),
            text: trimmed,
            color: editingColor,
            fontStyle: editingFontStyle,
            x: 0.5,
            y: Math.min(0.8, 0.25 + textOverlays.length * 0.12),
        };
        setTextOverlays((prev) => [...prev, overlay]);
        closeTextEditor();
    };

    // ─────────────────────────────────────────
    // Upload
    // ─────────────────────────────────────────
    const handleShare = async () => {
        if (!uri || !userId || uploading) return;
        setUploading(true);
        setUploadProgress(0);

        try {
            let uploadUri = uri;
            const mediaType = type === 'video' ? 'video' : 'image';

            // Compress assets safely (fallback to original if native library is missing)
            if (mediaType === 'image') {
                try {
                    console.log('[StoryUpload] Compressing image...');
                    uploadUri = await compressImageSafe(uri, 1080, 0.75);
                    console.log('✅ Image compressed or using original!');
                } catch (e) {
                    console.warn('[StoryUpload] Compression fallback failed');
                }
            } else if (mediaType === 'video') {
                try {
                    console.log('[StoryUpload] Compressing video...');
                    uploadUri = await compressVideoSafe(uri);
                    console.log('✅ Video compressed or using original!');
                } catch (e) {
                    console.warn('[StoryUpload] Video compression fallback failed:', e);
                }
            }


            const loc = locationData ?? undefined;

            // Resolve allowedFollowers
            let allowedFollowers: string[] = [];
            if (selectedGroupId) {
                const grp = userGroups.find(grp => grp._id === selectedGroupId);
                if (grp) allowedFollowers = grp.members;
            }

            const storyRes = await createStory(
                userId,
                uploadUri,
                mediaType,
                undefined, // userName
                loc,
                undefined, // thumbnailUrl
                visibility,
                allowedFollowers,
                (percent: number) => {
                    setUploadProgress(Math.min(99, Math.max(0, Math.round(percent))));
                },
                isPostShareParam,
                postDataRaw ? JSON.parse(postDataRaw) : undefined
            );


            if (!storyRes?.success) throw new Error('Upload failed');

            setUploadProgress(100);
            setTimeout(() => {
                // Go back to home, trigger stories refresh
                router.replace('/(tabs)/home' as any);
            }, 600);
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to upload story. Try again.');
            setUploading(false);
            setUploadProgress(0);
        }
    };

    if (!uri) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top }]}>
                <Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>No media selected.</Text>
                <TouchableOpacity onPress={() => safeRouterBack()}>
                    <Text style={{ color: '#0095f6', textAlign: 'center', marginTop: 12 }}>Go back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => safeRouterBack()} style={styles.headerBtn} disabled={uploading}>
                    <Feather name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New Story</Text>
                <TouchableOpacity style={styles.headerBtn} onPress={openTextEditorNew} disabled={uploading}>
                    <Text style={styles.aaText}>Aa</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={scrollEnabled}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                >
                    {/* ── Preview ── */}
                    <View style={styles.preview}>
                        {type === 'video' ? (
                            <Video
                                source={{ uri }}
                                style={styles.previewImg}
                                resizeMode={ResizeMode.COVER}
                                shouldPlay
                                isMuted
                                isLooping
                                useNativeControls={false}
                            />
                        ) : (
                            <Image source={{ uri }} style={styles.previewImg} resizeMode="cover" />
                        )}

                        {/* Text overlays preview */}
                        {textOverlays.map((o) => (
                            <DraggableOverlay 
                                key={o.id} 
                                overlay={o} 
                                isSelected={selectedOverlayId === o.id}
                                pos={overlayPositionsRef.current[o.id] || new Animated.ValueXY({ x: o.x * SCREEN_W, y: o.y * PREVIEW_H })}
                                onSelect={openTextEditorForOverlay}
                                onDelete={deleteOverlay}
                                onUpdatePosition={(id, x, y) => {
                                    setTextOverlays(prev => prev.map(item => item.id === id ? { ...item, x, y } : item));
                                }}
                                setScrollEnabled={setScrollEnabled}
                            />
                        ))}
                    </View>

                    {/* ── Share to section (like Instagram) ── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Share to</Text>
                        <View style={styles.shareToRow}>
                            <TouchableOpacity 
                                style={styles.shareToItem}
                                onPress={() => setShowVisibilityModal(true)}
                            >
                                <View style={styles.shareToIcon}>
                                    <Feather name={visibility === 'Everyone' ? 'book-open' : 'users'} size={22} color="#fff" />
                                </View>
                                <View>
                                    <Text style={styles.shareToLabel}>Visibility</Text>
                                    <Text style={styles.shareToSubLabel}>{visibility}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Visibility Modal */}
                    <Modal
                        visible={showVisibilityModal}
                        transparent
                        animationType="slide"
                        onRequestClose={() => setShowVisibilityModal(false)}
                    >
                        <TouchableWithoutFeedback onPress={() => setShowVisibilityModal(false)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                                    <View style={styles.modalContent}>
                                        <View style={styles.modalHeader}>
                                            <View style={styles.modalHandle} />
                                            <Text style={styles.modalTitle}>Who can see your story?</Text>
                                        </View>
                                        <ScrollView style={styles.visibilityList}>
                                            {[
                                                { label: 'Everyone', subtitle: 'All your followers', icon: 'globe', groupId: null },
                                                ...userGroups.map(g => ({ label: g.name, subtitle: `${g.members?.length || 0} members`, icon: 'users', groupId: g._id }))
                                            ].map((option) => (
                                                <TouchableOpacity
                                                    key={option.groupId || 'everyone'}
                                                    style={styles.visibilityOption}
                                                    onPress={() => {
                                                        setVisibility(option.label);
                                                        setSelectedGroupId(option.groupId);
                                                        setShowVisibilityModal(false);
                                                    }}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                        <View style={[styles.optionIconContainer, visibility === option.label && styles.optionIconContainerActive]}>
                                                            <Feather name={option.icon as any} size={20} color={visibility === option.label ? '#fff' : '#888'} />
                                                        </View>
                                                        <View style={{ marginLeft: 12 }}>
                                                            <Text style={[
                                                                styles.visibilityText,
                                                                visibility === option.label && styles.visibilityTextSelected
                                                            ]}>
                                                                {option.label}
                                                            </Text>
                                                            <Text style={styles.visibilitySubtitle}>{option.subtitle}</Text>
                                                        </View>
                                                    </View>
                                                    <View style={[styles.radioOuter, visibility === option.label && styles.radioOuterActive]}>
                                                        {visibility === option.label && <View style={styles.radioInner} />}
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity 
                                                style={[styles.visibilityOption, { borderBottomWidth: 0, marginTop: 10 }]}
                                                onPress={() => {
                                                    setShowVisibilityModal(false);
                                                    router.push('/(tabs)/home'); // Suggesting where to manage groups or just open drawer
                                                }}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                    <View style={[styles.optionIconContainer, { backgroundColor: '#333' }]}>
                                                        <Feather name="plus" size={20} color="#0095f6" />
                                                    </View>
                                                    <Text style={[styles.visibilityText, { color: '#0095f6', marginLeft: 12 }]}>Create new group</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </ScrollView>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>



                    {/* ── Location ── */}
                    <View style={[styles.section, { zIndex: 10 }]}>
                        <Text style={styles.sectionTitle}>Location</Text>
                        <View style={styles.locationWrap}>
                            <Feather name="map-pin" size={16} color="#888" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.locationInput}
                                placeholder="Add location..."
                                placeholderTextColor="#666"
                                value={locationQuery}
                                onChangeText={(t) => { setLocationQuery(t); if (!t) setLocationData(null); }}
                                returnKeyType="done"
                                blurOnSubmit
                            />
                            {locationData && (
                                <TouchableOpacity onPress={() => { setLocationData(null); setLocationQuery(''); }}>
                                    <Feather name="x-circle" size={16} color="#888" />
                                </TouchableOpacity>
                            )}
                            {loadingLocations && <ActivityIndicator size="small" color="#888" style={{ marginLeft: 4 }} />}
                        </View>

                        {/* Suggestions */}
                        {locationSuggestions.length > 0 && (
                            <View style={styles.suggestionsBox}>
                                {locationSuggestions.slice(0, 5).map((item) => (
                                    <TouchableOpacity
                                        key={item.placeId}
                                        style={styles.suggestionItem}
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            setLocationData({ name: item.name, address: item.address, placeId: item.placeId });
                                            setLocationQuery(item.name);
                                            setLocationSuggestions([]);
                                        }}
                                    >
                                        <Feather name="map-pin" size={14} color="#0095f6" style={{ marginRight: 8 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.suggestionName}>{item.name}</Text>
                                            <Text style={styles.suggestionAddr} numberOfLines={1}>{item.address}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* ── Upload progress ── */}
                    {uploading && (
                        <View style={styles.progressBox}>
                            <ActivityIndicator color="#0095f6" size="small" />
                            <Text style={styles.progressText}>Uploading {uploadProgress}%</Text>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
                            </View>
                        </View>
                    )}

                    {/* ── Share button ── */}
                    <TouchableOpacity
                        style={[styles.shareBtn, uploading && styles.shareBtnDisabled]}
                        onPress={handleShare}
                        disabled={uploading}
                        activeOpacity={0.85}
                    >
                        {uploading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <>
                                <Feather name="send" size={18} color="#fff" />
                                <Text style={styles.shareBtnText}>Share to Story</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            <Modal
                visible={showTextEditor}
                animationType="slide"
                transparent={false}
                presentationStyle="fullScreen"
                statusBarTranslucent={false}
            >
                <View
                    style={[
                        styles.textEditorRoot,
                        {
                            paddingTop:
                                Platform.OS === 'android'
                                    ? Math.max(insets.top, StatusBar.currentHeight ?? 0, 28) + 6
                                    : Math.max(insets.top, 12) + 6,
                        },
                    ]}
                >
                    <View style={styles.textEditorHeader}>
                        <TouchableOpacity onPress={closeTextEditor} style={styles.headerBtn}>
                            <Feather name="x" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>{editingOverlayId ? 'Edit text' : 'Add text'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TouchableOpacity
                                onPress={() => setEditingText('')}
                                style={styles.textEditorClearBtn}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Feather name="trash-2" size={20} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={commitText} style={styles.doneBtn}>
                                <Text style={styles.doneBtnText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <KeyboardAvoidingView
                        style={styles.textEditorKav}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={0}
                    >
                        <View style={styles.textEditorBg}>
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                            <View style={styles.textEditorPreview}>
                                {type === 'video' ? (
                                    <Video
                                        source={{ uri }}
                                        style={styles.textEditorPreviewImage}
                                        resizeMode={ResizeMode.COVER}
                                        shouldPlay={false}
                                    />
                                ) : (
                                    <Image source={{ uri }} style={styles.textEditorPreviewImage} resizeMode="cover" />
                                )}
                                {Platform.OS === 'ios' ? (
                                    <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFillObject} />
                                ) : (
                                    <View
                                        style={[
                                            StyleSheet.absoluteFillObject,
                                            { backgroundColor: 'rgba(0,0,0,0.45)' },
                                        ]}
                                    />
                                )}
                                <View style={styles.textEditorOverlay} />
                                <TextInput
                                    style={[
                                        styles.textInput,
                                        {
                                            color: editingColor,
                                            fontFamily: FONT_STYLES[editingFontStyle].fontFamily,
                                            letterSpacing: FONT_STYLES[editingFontStyle].letterSpacing,
                                            textTransform: FONT_STYLES[editingFontStyle].textTransform,
                                        },
                                    ]}
                                    placeholder="Type something..."
                                    placeholderTextColor="rgba(255,255,255,0.6)"
                                    value={editingText}
                                    onChangeText={setEditingText}
                                    multiline
                                    autoFocus
                                    maxLength={120}
                                    textAlignVertical="center"
                                />
                            </View>
                        </TouchableWithoutFeedback>

                        <View
                            style={[
                                styles.textEditorTools,
                                { paddingBottom: Math.max(insets.bottom, 10) },
                            ]}
                        >
                            <View style={styles.fontStyleRow}>
                                {(Object.keys(FONT_STYLES) as FontStyleKey[]).map((key) => (
                                    <TouchableOpacity
                                        key={key}
                                        style={[styles.fontStyleBtn, editingFontStyle === key && styles.fontStyleBtnActive]}
                                        onPress={() => setEditingFontStyle(key)}
                                    >
                                        <Text style={[styles.fontStyleLabel, editingFontStyle === key && styles.fontStyleLabelActive]}>
                                            {FONT_STYLES[key].label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
                                {TEXT_COLORS.map((c) => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.colorDot, { backgroundColor: c }, editingColor === c && styles.colorDotSelected]}
                                        onPress={() => setEditingColor(c)}
                                    />
                                ))}
                            </ScrollView>
                        </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

// ─────────────────────────────────────────────
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#000' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 12,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
    aaText: { color: '#fff', fontSize: 18, fontWeight: '700' },

    // Preview
    preview: { width: SCREEN_W, height: PREVIEW_H, backgroundColor: '#111', overflow: 'hidden' },
    previewImg: { width: '100%', height: '100%' },
    overlayTextWrap: { position: 'absolute', maxWidth: SCREEN_W - 20 },
    overlayDragWrap: {
        position: 'absolute',
        left: -40, // Offset to center the touch point better
        top: 0,
        maxWidth: SCREEN_W - 20,
        padding: 2,
    },
    overlayDragWrapSelected: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.12)',
    },
    overlayText: { fontSize: 24, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
    overlayDeleteBtn: {
        position: 'absolute',
        top: -10,
        right: -10,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
    },

    // Section
    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionTitle: { color: '#999', fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },

    // Share to
    shareToRow: { flexDirection: 'row', gap: 16 },
    shareToItem: { alignItems: 'center', gap: 6 },
    shareToIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center' },
    shareToLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // Location
    locationWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#1a1a1a', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10,
    },
    locationInput: { flex: 1, color: '#fff', fontSize: 15 },
    suggestionsBox: { backgroundColor: '#1e1e1e', borderRadius: 12, marginTop: 6, overflow: 'hidden' },
    suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
    suggestionName: { color: '#fff', fontSize: 14, fontWeight: '600' },
    suggestionAddr: { color: '#666', fontSize: 12, marginTop: 2 },

    // Progress
    progressBox: { marginHorizontal: 16, marginTop: 16, alignItems: 'center', gap: 8 },
    progressText: { color: '#fff', fontSize: 14 },
    progressBarBg: { width: '100%', height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
    progressBar: { height: '100%', backgroundColor: '#0095f6', borderRadius: 2 },

    // Share button
    shareBtn: {
        marginHorizontal: 16, marginTop: 24,
        backgroundColor: '#0095f6', borderRadius: 14,
        paddingVertical: 14, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    shareBtnDisabled: { opacity: 0.5 },
    shareBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

    // Text editor modal (header outside KAV so top bar never gets squeezed off-screen)
    textEditorRoot: { flex: 1, backgroundColor: '#000' },
    textEditorKav: { flex: 1, minHeight: 0, backgroundColor: '#000' },
    textEditorBg: { flex: 1, minHeight: 0, backgroundColor: '#000' },
    textEditorHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingBottom: 8,
        flexShrink: 0,
        backgroundColor: '#000',
    },
    textEditorClearBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    doneBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#0095f6', borderRadius: 20 },
    doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    textEditorPreview: {
        flex: 1,
        minHeight: 0,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    textEditorPreviewImage: {
        ...StyleSheet.absoluteFillObject,
    },
    textEditorOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.42)',
    },
    textInput: {
        fontSize: 32,
        fontWeight: '700',
        width: SCREEN_W - 40,
        textAlign: 'center',
        color: '#fff',
        zIndex: 10,
        paddingHorizontal: 8,
    },
    textEditorTools: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.12)',
        backgroundColor: '#050505',
    },
    fontStyleRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 10,
        gap: 10,
    },
    fontStyleBtn: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    fontStyleBtnActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    fontStyleLabel: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 13,
        fontWeight: '600',
    },
    fontStyleLabelActive: { color: '#000' },
    colorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 10,
    },
    colorDot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorDotSelected: {
        borderWidth: 3,
        borderColor: '#fff',
    },
    shareToSubLabel: { color: '#0095f6', fontSize: 11, marginTop: 2 },
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1c1c1e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingBottom: 40, maxHeight: '60%',
    },
    modalHeader: {
        padding: 20, borderBottomWidth: 1, borderBottomColor: '#333', alignItems: 'center',
    },
    modalHandle: {
        width: 40, height: 4, backgroundColor: '#444', borderRadius: 2, marginBottom: 12,
    },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    visibilityList: { padding: 10 },
    visibilityOption: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#222',
    },
    visibilityText: { color: '#888', fontSize: 16 },
    visibilityTextSelected: { color: '#fff', fontWeight: '600' },
    visibilitySubtitle: { color: '#555', fontSize: 12, marginTop: 2 },
    optionIconContainer: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: '#2c2c2e', 
        alignItems: 'center', justifyContent: 'center',
    },
    optionIconContainerActive: {
        backgroundColor: '#0095f6',
    },
    radioOuter: {
        width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#444',
        alignItems: 'center', justifyContent: 'center',
    },
    radioOuterActive: {
        borderColor: '#0095f6',
    },
    radioInner: {
        width: 12, height: 12, borderRadius: 6, backgroundColor: '#0095f6',
    },
});


