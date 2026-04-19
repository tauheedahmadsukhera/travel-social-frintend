import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    FlatList,
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
import { safeRouterBack } from '@/lib/safeRouterBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface GalleryAsset {
    id: string;
    uri: string;
    mediaType: 'photo' | 'video';
    duration?: number;
}

interface TextOverlay {
    id: string;
    text: string;
    color: string;
    fontStyle: FontStyleKey;
    x: number; // 0-1 relative
    y: number; // 0-1 relative
}

type FontStyleKey = 'classic' | 'modern' | 'strong';

const FONT_STYLES: Record<FontStyleKey, { label: string; fontFamily?: string; italic?: boolean; letterSpacing?: number; textTransform?: 'uppercase' | 'none' }> = {
    classic: { label: 'Classic', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
    modern: { label: 'Modern', fontFamily: undefined, letterSpacing: 1 },
    strong: { label: 'Strong', fontFamily: undefined, letterSpacing: 2, textTransform: 'uppercase' },
};

const TEXT_COLORS = [
    '#ffffff', '#000000', '#FFD700', '#FF4444',
    '#44CFFF', '#44FF88', '#FF44CC', '#FF8800',
    '#8B44FF', '#FF6B6B', '#4ECDC4', '#96E6A1',
];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLS = 3;
const TILE_SIZE = SCREEN_W / COLS;
const PREVIEW_H = SCREEN_W * 1.1;

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function StoryCreatorScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Gallery
    const [assets, setAssets] = useState<GalleryAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [selectedUri, setSelectedUri] = useState<string | null>(null);
    const [selectedAsset, setSelectedAsset] = useState<GalleryAsset | null>(null);
    const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Text overlays
    const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
    const [showTextEditor, setShowTextEditor] = useState(false);
    const [editingText, setEditingText] = useState('');
    const [editingColor, setEditingColor] = useState('#ffffff');
    const [editingFontStyle, setEditingFontStyle] = useState<FontStyleKey>('classic');
    const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

    // ─────────────────────────────────────────
    // Gallery permissions + load
    // ─────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            setHasPermission(status === 'granted');
            if (status === 'granted') await loadAssets();
            else setLoading(false);
        })();
    }, []);

    const loadAssets = async (after?: string) => {
        try {
            const page = await MediaLibrary.getAssetsAsync({
                mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
                sortBy: [[MediaLibrary.SortBy.creationTime, false]],
                first: 30,
                after,
            });
            const mapped: GalleryAsset[] = page.assets.map((a) => ({
                id: a.id,
                uri: a.uri,
                mediaType: a.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo',
                duration: a.duration,
            }));
            setAssets((prev) => (after ? [...prev, ...mapped] : mapped));
            setEndCursor(page.endCursor);
            setHasNextPage(page.hasNextPage);
            if (!after && mapped.length > 0) {
                setSelectedUri(mapped[0].uri);
                setSelectedAsset(mapped[0]);
            }
        } catch (e) {
            console.error('[StoryCreator] Error loading assets:', e);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadMore = async () => {
        if (!hasNextPage || loadingMore) return;
        setLoadingMore(true);
        await loadAssets(endCursor);
    };

    // ─────────────────────────────────────────
    // Camera
    // ─────────────────────────────────────────
    const openCamera = async () => {
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) return;
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsEditing: false,
                quality: 0.9,
                videoMaxDuration: 60,
            });
            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                navigateWithMedia(asset.uri, asset.type === 'video' ? 'video' : 'photo');
            }
        } catch (e) {
            console.error('[StoryCreator] Camera error:', e);
        }
    };

    // ─────────────────────────────────────────
    // Navigate back with media + text overlays
    // ─────────────────────────────────────────
    const navigateWithMedia = useCallback(
        (uri: string, type: 'photo' | 'video') => {
            router.push({
                pathname: '/story-upload',
                params: {
                    storyMediaUri: uri,
                    storyMediaType: type,
                    storyTextOverlays: textOverlays.length > 0 ? JSON.stringify(textOverlays) : '',
                },
            } as any);
        },
        [router, textOverlays]
    );

    const handleNext = () => {
        if (!selectedAsset) return;
        navigateWithMedia(selectedAsset.uri, selectedAsset.mediaType);
    };


    // ─────────────────────────────────────────
    // Text editor
    // ─────────────────────────────────────────
    const openTextEditor = () => {
        setEditingText('');
        setEditingColor('#ffffff');
        setEditingFontStyle('classic');
        setShowTextEditor(true);
    };

    const commitText = () => {
        const trimmed = editingText.trim();
        if (!trimmed) {
            setShowTextEditor(false);
            return;
        }
        const overlay: TextOverlay = {
            id: Date.now().toString(),
            text: trimmed,
            color: editingColor,
            fontStyle: editingFontStyle,
            x: 0.5,
            y: 0.45,
        };
        setTextOverlays((prev) => [...prev, overlay]);
        setShowTextEditor(false);
    };

    const deleteOverlay = (id: string) => {
        setTextOverlays((prev) => prev.filter((o) => o.id !== id));
        setSelectedOverlayId((prev) => (prev === id ? null : prev));
    };

    // ─────────────────────────────────────────
    // Draggable text overlay component
    // ─────────────────────────────────────────
    const DraggableText = ({ overlay }: { overlay: TextOverlay }) => {
        const isSelected = selectedOverlayId === overlay.id;
        const baseRef = useRef({ x: overlay.x * SCREEN_W, y: overlay.y * PREVIEW_H });
        const pan = useRef(new Animated.ValueXY({ x: baseRef.current.x, y: baseRef.current.y })).current;

        // If overlays are re-hydrated or changed, keep animation state in sync
        useEffect(() => {
            const nx = overlay.x * SCREEN_W;
            const ny = overlay.y * PREVIEW_H;
            baseRef.current = { x: nx, y: ny };
            pan.setValue({ x: nx, y: ny });
        }, [overlay.id, overlay.x, overlay.y, pan]);

        const panResponder = useRef(
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 2,
                onPanResponderGrant: () => {
                    setSelectedOverlayId(overlay.id);
                    pan.stopAnimation();
                    // Offset-based drag so we don't re-render on move.
                    pan.setOffset(baseRef.current);
                    pan.setValue({ x: 0, y: 0 });
                },
                onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
                onPanResponderRelease: () => {
                    pan.flattenOffset();
                    // Clamp within preview bounds on release
                    const cur: any = (pan as any).__getValue ? (pan as any).__getValue() : { x: baseRef.current.x, y: baseRef.current.y };
                    const rawX = typeof cur?.x === 'number' ? cur.x : baseRef.current.x;
                    const rawY = typeof cur?.y === 'number' ? cur.y : baseRef.current.y;

                    const clampedX = Math.max(0, Math.min(SCREEN_W, rawX));
                    const clampedY = Math.max(0, Math.min(PREVIEW_H - 10, rawY));

                    baseRef.current = { x: clampedX, y: clampedY };
                    pan.setValue({ x: clampedX, y: clampedY });

                    setTextOverlays((prev) =>
                        prev.map((o) =>
                            o.id === overlay.id ? { ...o, x: clampedX / SCREEN_W, y: clampedY / PREVIEW_H } : o
                        )
                    );
                },
            })
        ).current;

        const fs = FONT_STYLES[overlay.fontStyle];

        return (
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    styles.textOverlay,
                    {
                        transform: [
                            { translateX: pan.x },
                            { translateY: pan.y },
                            { translateX: -40 },
                        ],
                    },
                ]}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setSelectedOverlayId(overlay.id)}
                    onLongPress={() => deleteOverlay(overlay.id)}
                    delayLongPress={450}
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
                        onPress={() => deleteOverlay(overlay.id)}
                        style={styles.overlayDeleteBadge}
                        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                    >
                        <Feather name="x" size={14} color="#fff" />
                    </TouchableOpacity>
                )}
            </Animated.View>
        );
    };

    // ─────────────────────────────────────────
    // Gallery tile
    // ─────────────────────────────────────────
    const renderTile = useCallback(
        ({ item }: { item: GalleryAsset }) => {
            const isSelected = item.uri === selectedUri;
            return (
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                        setSelectedUri(item.uri);
                        setSelectedAsset(item);
                    }}
                    style={[styles.tile, { width: TILE_SIZE, height: TILE_SIZE }]}
                >
                    <Image source={{ uri: item.uri }} style={styles.tileImg} />
                    {item.mediaType === 'video' && (
                        <View style={styles.videoBadge}>
                            <Feather name="video" size={10} color="#fff" />
                            {item.duration != null && (
                                <Text style={styles.videoDuration}>
                                    {Math.floor(item.duration / 60)}:
                                    {String(Math.floor(item.duration % 60)).padStart(2, '0')}
                                </Text>
                            )}
                        </View>
                    )}
                    {isSelected && <View style={styles.selectedOverlay} />}
                    {isSelected && (
                        <View style={styles.selectedDot}>
                            <Feather name="check" size={12} color="#fff" />
                        </View>
                    )}
                </TouchableOpacity>
            );
        },
        [selectedUri]
    );

    const CameraTile = () => (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={openCamera}
            style={[styles.tile, styles.cameraTile, { width: TILE_SIZE, height: TILE_SIZE }]}
        >
            <Feather name="camera" size={30} color="#fff" />
            <Text style={styles.cameraLabel}>Camera</Text>
        </TouchableOpacity>
    );

    // ─────────────────────────────────────────
    // Permission denied screen
    // ─────────────────────────────────────────
    if (hasPermission === false) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => safeRouterBack()} style={styles.headerBtn}>
                        <Feather name="x" size={26} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Add to story</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.permissionBox}>
                    <Feather name="image" size={56} color="#555" />
                    <Text style={styles.permissionText}>Gallery access required</Text>
                    <Text style={styles.permissionSub}>Allow access in Settings → Permissions</Text>
                </View>
            </View>
        );
    }

    // ─────────────────────────────────────────
    // Main render
    // ─────────────────────────────────────────
    return (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => safeRouterBack()} style={styles.headerBtn}>
                    <Feather name="x" size={26} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add to story</Text>
                <TouchableOpacity
                    onPress={handleNext}
                    style={[styles.nextBtn, !selectedAsset && styles.nextBtnDisabled]}
                    disabled={!selectedAsset}
                >
                    <Text style={styles.nextBtnText}>Next</Text>
                    <Feather name="chevron-right" size={18} color="#fff" />
                </TouchableOpacity>
            </View>


            {/* ── Preview ── */}
            <View style={styles.preview}>
                {selectedUri ? (
                    <Image source={{ uri: selectedUri }} style={styles.previewImg} resizeMode="cover" />
                ) : null}

            </View>

            {/* ── Recents label ── */}
            <View style={styles.recentsRow}>
                <Text style={styles.recentsLabel}>Recents</Text>
            </View>

            {/* ── Grid ── */}
            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#fff" />
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={assets}
                    keyExtractor={(item) => item.id}
                    numColumns={COLS}
                    renderItem={renderTile}
                    ListHeaderComponent={<CameraTile />}
                    ListHeaderComponentStyle={{ width: TILE_SIZE }}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    showsVerticalScrollIndicator={false}
                    ListFooterComponent={
                        loadingMore ? (
                            <ActivityIndicator size="small" color="#999" style={{ marginVertical: 12 }} />
                        ) : null
                    }
                    columnWrapperStyle={styles.row}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                />
            )}

        </View>
    );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#fff' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: '#000', fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },

    // Next button
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 2,
        backgroundColor: '#0095f6', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    // Preview
    preview: {
        width: SCREEN_W,
        height: PREVIEW_H,
        backgroundColor: '#f5f5f5',
        overflow: 'hidden',
    },
    previewImg: { width: '100%', height: '100%' },

    // Aa button
    aaBtn: {
        position: 'absolute',
        top: 12,
        left: 14,
        backgroundColor: 'rgba(255,255,255,0.85)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    aaBtnText: { color: '#000', fontSize: 17, fontWeight: '700' },

    // Drag hint
    dragHint: {
        position: 'absolute',
        bottom: 8,
        alignSelf: 'center',
        backgroundColor: 'rgba(255,255,255,0.8)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    dragHintText: { color: 'rgba(0,0,0,0.6)', fontSize: 11 },

    // Text overlay on preview
    textOverlay: {
        position: 'absolute',
        maxWidth: SCREEN_W - 20,
    },
    overlayText: {
        fontSize: 26,
        fontWeight: '700',
        textShadowColor: 'rgba(255,255,255,0.3)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 4,
    },
    overlayDeleteBadge: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(0,0,0,0.65)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#fff',
    },

    // Gallery
    recentsRow: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
    recentsLabel: { color: '#000', fontSize: 16, fontWeight: '700' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: { gap: 1, marginBottom: 1 },
    tile: { position: 'relative', overflow: 'hidden', backgroundColor: '#f0f0f0' },
    tileImg: { width: '100%', height: '100%' },
    cameraTile: { backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', gap: 6 },
    cameraLabel: { color: '#000', fontSize: 12, fontWeight: '600' },
    videoBadge: {
        position: 'absolute', bottom: 4, right: 4,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 4,
        paddingHorizontal: 4, paddingVertical: 2, gap: 3,
    },
    videoDuration: { color: '#000', fontSize: 10, fontWeight: '600' },
    selectedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,149,246,0.15)' },
    selectedDot: {
        position: 'absolute', top: 6, right: 6,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#fff',
    },

    // Permission
    permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
    permissionText: { color: '#000', fontSize: 17, fontWeight: '700', textAlign: 'center' },
    permissionSub: { color: '#666', fontSize: 14, textAlign: 'center' },


    // ── Text Editor Modal ──
    textEditorBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
    textEditorHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8,
    },
    doneBtn: {
        paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: '#0095f6', borderRadius: 20,
    },
    doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    textEditorPreview: {
        width: SCREEN_W,
        height: SCREEN_W * 0.75,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    textEditorOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    textInput: {
        fontSize: 28,
        fontWeight: '700',
        width: SCREEN_W - 40,
        textAlign: 'center',
        color: '#fff',
        zIndex: 10,
    },

    // Font style row
    fontStyleRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 12,
    },
    fontStyleBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    fontStyleBtnActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    fontStyleLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    fontStyleLabelActive: {
        color: '#000',
    },

    // Color picker
    colorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 10,
        paddingBottom: 24,
    },
    colorDot: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorDotSelected: {
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
        elevation: 4,
    },
});
