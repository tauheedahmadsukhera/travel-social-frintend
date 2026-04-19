/**
 * CollectionDeleteModal
 * Confirmation sheet for deleting a collection:
 *  - Option A: delete with all content
 *  - Option B: migrate posts to another collection first, then delete
 */
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../_services/apiService';

interface Collection {
    _id: string;
    name: string;
    coverImage?: string;
    postIds: string[];
}

interface Props {
    visible: boolean;
    onClose: () => void;
    collection: Collection | null;
    allCollections: Collection[];
    currentUserId?: string;
    onDeleted: (deletedId: string) => void;
}

type Step = 'confirm' | 'migrate-pick';

export default function CollectionDeleteModal({
    visible, onClose, collection, allCollections, currentUserId, onDeleted,
}: Props) {
    const insets = useSafeAreaInsets();
    const [step, setStep] = useState<Step>('confirm');
    const [migrateTo, setMigrateTo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            setStep('confirm');
            setMigrateTo(null);
        }
    }, [visible]);

    if (!collection) return null;

    const otherCollections = allCollections.filter(c => c._id !== collection._id);
    const hasContent = collection.postIds?.length > 0;

    const doDelete = async (targetId?: string) => {
        const uid = currentUserId;
        if (!uid) return;
        setLoading(true);
        try {
            const payload = {
                ...(targetId ? { migrateToSectionId: targetId } : {}),
                requesterId: uid,
                requesterUserId: uid,
                viewerId: uid,
            };

            // Some backends address sections by `_id`, others by `name`.
            // Try `_id` first, then fall back to `name`.
            let res = await apiService.delete(`/users/${uid}/sections/${encodeURIComponent(collection._id)}`, payload);
            if (!res?.success) {
                res = await apiService.delete(`/users/${uid}/sections/${encodeURIComponent(collection.name)}`, payload);
            }

            if (res?.success) {
                onDeleted(collection._id);
                onClose();
            } else {
                Alert.alert('Error', res?.error || 'Failed to delete collection');
            }
        } catch (e) {
            console.error('delete collection error', e);
            Alert.alert('Error', 'Failed to delete collection');
        } finally {
            setLoading(false);
        }
    };

    // ── Step: confirm ────────────────────────────────────────────────────────

    const renderConfirm = () => (
        <View style={styles.body}>
            <View style={styles.iconWrap}>
                <Feather name="trash-2" size={28} color="#E74C3C" />
            </View>
            <Text style={styles.title}>Do you want to keep your saved post?</Text>
            <View style={styles.btnRow}>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.yesBtn]}
                    onPress={() => setStep('migrate-pick')}
                >
                    <Text style={styles.btnText}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.noBtn]}
                    onPress={() => doDelete()}
                >
                    <Text style={styles.btnText}>No</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
        </View>
    );

    // ── Step: migrate-pick ───────────────────────────────────────────────────

    const renderMigratePick = () => (
        <View style={styles.body}>
            <Text style={styles.title}>Move content to…</Text>
            <Text style={styles.subtitle}>
                Select a collection to migrate posts into before deleting.
            </Text>

            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {otherCollections.map(col => (
                    <TouchableOpacity
                        key={col._id}
                        style={[styles.collRow, migrateTo === col._id && styles.collRowSelected]}
                        onPress={() => setMigrateTo(col._id)}
                    >
                        <View style={styles.collThumb}>
                            {col.coverImage ? (
                                <ExpoImage source={{ uri: col.coverImage }} style={styles.collThumbImg} contentFit="cover" />
                            ) : (
                                <View style={[styles.collThumbImg, styles.collThumbPlaceholder]}>
                                    <Feather name="image" size={16} color="#ccc" />
                                </View>
                            )}
                        </View>
                        <Text style={styles.collName}>{col.name}</Text>
                        <View style={[styles.radio, migrateTo === col._id && styles.radioSelected]}>
                            {migrateTo === col._id && <View style={styles.radioDot} />}
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <TouchableOpacity
                style={[styles.deleteBtn, !migrateTo && styles.btnDisabled]}
                onPress={() => migrateTo && doDelete(migrateTo)}
                disabled={!migrateTo || loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.deleteBtnText}>Migrate & Delete</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep('confirm')}>
                <Text style={styles.cancelBtnText}>Back</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.backdrop} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
                <View style={styles.dragHandle} />
                {step === 'confirm' && renderConfirm()}
                {step === 'migrate-pick' && renderMigratePick()}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '75%',
    },
    dragHandle: {
        width: 36, height: 4,
        borderRadius: 2,
        backgroundColor: '#ddd',
        alignSelf: 'center',
        marginTop: 10, marginBottom: 4,
    },
    body: {
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    iconWrap: {
        width: 60, height: 60,
        borderRadius: 30,
        backgroundColor: '#FEF0EE',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginBottom: 14,
    },
    title: {
        fontSize: 18, fontWeight: '700',
        color: '#111',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 13, color: '#888',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    optionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#EFF3F8',
        borderRadius: 12,
        marginBottom: 12,
    },
    optionBtnLabel: { fontSize: 14, fontWeight: '600', color: '#0A3D62' },
    optionBtnSub: { fontSize: 12, color: '#888', marginTop: 2 },
    btnRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 16,
    },
    actionBtn: {
        flex: 1,
        height: 48,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    yesBtn: { backgroundColor: '#0A3D62' },
    noBtn: { backgroundColor: '#2C5A96' }, // A slightly different blue as in screenshot
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    cancelBtn: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelBtnText: { color: '#888', fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
    list: { maxHeight: 260, marginBottom: 16 },
    collRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f0f0',
    },
    collRowSelected: { backgroundColor: '#F0F7FF' },
    collThumb: {
        width: 44, height: 44,
        borderRadius: 8,
        overflow: 'hidden',
        marginRight: 12,
    },
    collThumbImg: { width: '100%', height: '100%' },
    collThumbPlaceholder: { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
    collName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
    deleteBtn: {
        height: 48,
        borderRadius: 12,
        backgroundColor: '#E74C3C',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    deleteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    radio: {
        width: 20, height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioSelected: { borderColor: '#0A3D62' },
    radioDot: {
        width: 10, height: 10,
        borderRadius: 5,
        backgroundColor: '#0A3D62',
    },
});
