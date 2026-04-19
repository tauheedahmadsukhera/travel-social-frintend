import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { apiService } from '../_services/apiService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.88;

export type Group = {
    _id: string;
    userId: string;
    name: string;
    type: 'friends' | 'family' | 'custom';
    members: string[];
    createdAt: string;
};

type GroupsDrawerProps = {
    visible: boolean;
    onClose: () => void;
};

// ── Palette ──────────────────────────────────────────────────────────────────
const COLORS = {
    friends: { bg: '#4F8EF7', light: '#EBF2FF', text: '#2563EB' },
    family: { bg: '#F97316', light: '#FFF3E8', text: '#C2410C' },
    custom: { bg: '#8B5CF6', light: '#F3EEFF', text: '#6D28D9' },
};

// ── API Helpers ───────────────────────────────────────────────────────────────
async function fetchGroups(userId: string): Promise<Group[]> {
    try {
        const res = await apiService.get(`/groups?userId=${userId}`);
        return res?.success ? (res.data as Group[]) : [];
    } catch { return []; }
}
async function createGroupApi(userId: string, name: string, type: Group['type']): Promise<Group | null> {
    try {
        const res = await apiService.post('/groups', { userId, name, type, members: [] });
        return res?.success ? (res.data as Group) : null;
    } catch { return null; }
}
async function addMember(groupId: string, memberId: string): Promise<Group | null> {
    try {
        const res = await apiService.put(`/groups/${groupId}/members/add`, { memberId });
        return res?.success ? (res.data as Group) : null;
    } catch { return null; }
}
async function removeMember(groupId: string, memberId: string): Promise<Group | null> {
    try {
        const res = await apiService.put(`/groups/${groupId}/members/remove`, { memberId });
        return res?.success ? (res.data as Group) : null;
    } catch { return null; }
}
async function deleteGroup(groupId: string): Promise<boolean> {
    try {
        const res = await apiService.delete(`/groups/${groupId}`);
        return !!res?.success;
    } catch { return false; }
}

// ── MemberCard ────────────────────────────────────────────────────────────────
function MemberCard({ member, onRemove }: { member: any; onRemove: () => void }) {
    const name = member.displayName || member.name || member.userName || 'Unknown';
    const initials = name.trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
    const avatar = member.avatar || member.photoURL;

    return (
        <View style={styles.memberCard}>
            {avatar ? (
                <Image source={{ uri: avatar }} style={styles.memberAvatar} />
            ) : (
                <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
                    <Text style={styles.memberAvatarInitials}>{initials || '?'}</Text>
                </View>
            )}
            <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
            <TouchableOpacity onPress={onRemove} style={styles.memberRemoveBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={13} color="#999" />
            </TouchableOpacity>
        </View>
    );
}

// ── AddMemberModal ────────────────────────────────────────────────────────────
function AddMemberModal({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (user: any) => void; }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const timerRef = useRef<any>(null);

    const search = useCallback(async (text: string) => {
        if (!text.trim()) { setResults([]); return; }
        setLoading(true);
        try {
            const res = await apiService.get('/users/search', { params: { q: text, limit: 20 } });
            const users = res?.success ? (res.data ?? []) : Array.isArray(res) ? res : [];
            setResults(Array.isArray(users) ? users : []);
        } catch { setResults([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => search(query), 400);
    }, [query, search]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.addOverlay}>
                    <TouchableWithoutFeedback>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.addSheet}>
                            <View style={styles.addHandle} />
                            <Text style={styles.addSheetTitle}>Add Member</Text>
                            <Text style={styles.addSheetSub}>Search people to add to this group</Text>

                            <View style={styles.addSearchBar}>
                                <Feather name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                                <TextInput
                                    style={styles.addSearchInput}
                                    placeholder="Name or username…"
                                    placeholderTextColor="#9CA3AF"
                                    value={query}
                                    onChangeText={setQuery}
                                    autoFocus
                                />
                                {query.length > 0 && (
                                    <TouchableOpacity onPress={() => setQuery('')}>
                                        <Feather name="x-circle" size={16} color="#9CA3AF" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={{ height: 300 }}>
                                {loading ? (
                                    <ActivityIndicator size="small" color="#4F8EF7" style={{ marginTop: 24 }} />
                                ) : (
                                    <FlatList
                                        data={results}
                                        keyExtractor={(item) => String(item._id || item.id || item.uid)}
                                        keyboardShouldPersistTaps="handled"
                                        renderItem={({ item }) => {
                                            const name = item.displayName || item.name || item.userName || 'User';
                                            const initials = name.trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                                            const avatar = item.avatar || item.photoURL;
                                            return (
                                                <TouchableOpacity style={styles.addUserRow} onPress={() => { onAdd(item); onClose(); }}>
                                                    {avatar ? (
                                                        <Image source={{ uri: avatar }} style={styles.addUserAvatar} />
                                                    ) : (
                                                        <View style={[styles.addUserAvatar, styles.memberAvatarFallback]}>
                                                            <Text style={styles.memberAvatarInitials}>{initials || '?'}</Text>
                                                        </View>
                                                    )}
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.addUserName}>{name}</Text>
                                                        {!!item.userName && <Text style={styles.addUserHandle}>@{item.userName}</Text>}
                                                    </View>
                                                    <View style={styles.addUserBtn}>
                                                        <Feather name="plus" size={14} color="#fff" />
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        }}
                                        ListEmptyComponent={query.length > 1 ? (
                                            <View style={styles.addEmptyState}>
                                                <Feather name="user-x" size={32} color="#E5E7EB" />
                                                <Text style={styles.addEmptyText}>No users found</Text>
                                            </View>
                                        ) : null}
                                    />
                                )}
                            </View>

                            <TouchableOpacity onPress={onClose} style={styles.addCancelBtn}>
                                <Text style={styles.addCancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </KeyboardAvoidingView>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

// ── GroupCard ─────────────────────────────────────────────────────────────────
function GroupCard({ group, onGroupUpdated, onGroupDeleted }: { group: Group; onGroupUpdated: (g: Group) => void; onGroupDeleted: (id: string) => void; }) {
    const [memberProfiles, setMemberProfiles] = useState<any[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [expanded, setExpanded] = useState(true);

    const color = COLORS[group.type] || COLORS.custom;
    const icon: any = group.type === 'friends' ? 'users' : group.type === 'family' ? 'home' : 'layers';
    const typeLabel = group.type === 'friends' ? 'Friends' : group.type === 'family' ? 'Family' : 'Custom';

    const loadProfiles = useCallback(async () => {
        if (group.members.length === 0) { setMemberProfiles([]); return; }
        setLoadingMembers(true);
        try {
            const profiles = await Promise.all(
                group.members.map(async (uid) => {
                    try {
                        const res = await apiService.getUser(uid);
                        return res?.success ? { ...res.data, _id: uid } : { _id: uid };
                    } catch { return { _id: uid }; }
                })
            );
            setMemberProfiles(profiles);
        } finally { setLoadingMembers(false); }
    }, [group.members]);

    useEffect(() => { loadProfiles(); }, [loadProfiles]);

    const handleAdd = async (user: any) => {
        const memberId = String(user._id || user.id || user.uid || '');
        if (!memberId) return;
        const updated = await addMember(group._id, memberId);
        if (updated) onGroupUpdated(updated);
    };

    const handleRemove = async (memberId: string) => {
        const updated = await removeMember(group._id, memberId);
        if (updated) onGroupUpdated(updated);
    };

    const handleDelete = () => {
        Alert.alert('Delete Group', `"${group.name}" group delete ho jaayega.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { const ok = await deleteGroup(group._id); if (ok) onGroupDeleted(group._id); } }
        ]);
    };

    return (
        <View style={styles.groupCard}>
            {/* Card Header */}
            <TouchableOpacity style={styles.groupCardHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
                <View style={[styles.groupCardIcon, { backgroundColor: color.light }]}>
                    <Feather name={icon} size={18} color={color.bg} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.groupCardName}>{group.name}</Text>
                    <Text style={styles.groupCardMeta}>{group.members.length} member{group.members.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={[styles.typePill, { backgroundColor: color.light }]}>
                    <Text style={[styles.typePillText, { color: color.text }]}>{typeLabel}</Text>
                </View>
                <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="trash-2" size={15} color="#F87171" />
                </TouchableOpacity>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            {/* Expanded Content */}
            {expanded && (
                <View style={styles.groupCardBody}>
                    {loadingMembers ? (
                        <ActivityIndicator size="small" color={color.bg} style={{ marginVertical: 12 }} />
                    ) : memberProfiles.length === 0 ? (
                        <View style={styles.noMembersBox}>
                            <Feather name="user" size={20} color="#D1D5DB" />
                            <Text style={styles.noMembersText}>No members yet</Text>
                        </View>
                    ) : (
                        memberProfiles.map((m) => (
                            <MemberCard key={m._id} member={m} onRemove={() => handleRemove(m._id)} />
                        ))
                    )}

                    <TouchableOpacity style={[styles.addMemberBtn, { borderColor: color.bg + '60' }]} onPress={() => setShowAddModal(true)}>
                        <View style={[styles.addMemberBtnIcon, { backgroundColor: color.light }]}>
                            <Feather name="user-plus" size={13} color={color.bg} />
                        </View>
                        <Text style={[styles.addMemberBtnText, { color: color.text }]}>Add Member</Text>
                    </TouchableOpacity>
                </View>
            )}

            <AddMemberModal visible={showAddModal} onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
        </View>
    );
}

// ── Main Drawer ───────────────────────────────────────────────────────────────
export default function GroupsDrawer({ visible, onClose }: GroupsDrawerProps) {
    const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
    const [userId, setUserId] = useState<string | null>(null);
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    
    // New state for custom group creation
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupType, setNewGroupType] = useState<Group['type']>('custom');

    useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: visible ? 0 : DRAWER_WIDTH,
            useNativeDriver: true,
            damping: 20,
            stiffness: 180,
        }).start();
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        (async () => {
            let uid: string | null = null;
            try { uid = await AsyncStorage.getItem('userId'); } catch { }
            if (cancelled) return;
            if (uid) setUserId(uid);
            if (!uid) return;
            setLoading(true);
            try {
                const result = await fetchGroups(uid);
                if (!cancelled) setGroups(result);
            } catch { } finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [visible]);

    const handleCreate = async (type: Group['type'], customName?: string) => {
        let uid = userId;
        if (!uid) { try { uid = await AsyncStorage.getItem('userId'); } catch { } }
        if (!uid) { Alert.alert('Error', 'User not found. Please try again.'); return; }

        const name = customName || (type === 'friends' ? 'Friends' : type === 'family' ? 'Family' : 'Custom Group');
        
        // Allow creating multiple groups with same type if they have different names
        if (groups.find((g) => g.name.toLowerCase() === name.toLowerCase())) {
            Alert.alert('Already Exists', `"${name}" naam ka group pehle se maujood hai.`); return;
        }

        setCreating(true);
        try {
            const group = await createGroupApi(uid, name, type);
            if (group) { 
                setGroups((prev) => [...prev, group]); 
                setShowCreateModal(false);
                setNewGroupName('');
            }
            else { Alert.alert('Error', `Failed to create "${name}" group.`); }
        } catch (err: any) { Alert.alert('Error', err?.message || 'Failed.'); }
        finally { setCreating(false); }
    };

    const hasFriends = groups.some((g) => g.type === 'friends');
    const hasFamily = groups.some((g) => g.type === 'family');

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.backdrop} />
                </TouchableWithoutFeedback>

                <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
                    {/* ── Header ── */}
                    <View style={styles.drawerHeader}>
                        <View style={styles.drawerHeaderTop}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={20} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.drawerTitle}>My Groups</Text>
                            <View style={{ width: 36 }} />
                        </View>
                        <Text style={styles.drawerSubtitle}>
                            Control who can see your private posts
                        </Text>

                        {/* Create Buttons in header area */}
                        <View style={styles.headerCreateRow}>
                            {!hasFriends ? (
                                <TouchableOpacity
                                    style={styles.headerCreateBtn}
                                    onPress={() => handleCreate('friends')}
                                    activeOpacity={0.82}
                                >
                                    <Feather name="plus" size={14} color="#4F8EF7" />
                                    <Text style={styles.headerCreateBtnText}>Friends</Text>
                                </TouchableOpacity>
                            ) : null}
                            {!hasFamily ? (
                                <TouchableOpacity
                                    style={[styles.headerCreateBtn, { borderColor: '#F97316' + '50' }]}
                                    onPress={() => handleCreate('family')}
                                    activeOpacity={0.82}
                                >
                                    <Feather name="plus" size={14} color="#F97316" />
                                    <Text style={[styles.headerCreateBtnText, { color: '#C2410C' }]}>Family</Text>
                                </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                                style={[styles.headerCreateBtn, { borderColor: '#8B5CF6' + '50' }]}
                                onPress={() => {
                                    setNewGroupType('custom');
                                    setShowCreateModal(true);
                                }}
                                activeOpacity={0.82}
                            >
                                <Feather name="plus" size={14} color="#8B5CF6" />
                                <Text style={[styles.headerCreateBtnText, { color: '#fff' }]}>Custom</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── Body ── */}
                    {(loading || creating) ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator size="large" color="#4F8EF7" />
                            <Text style={styles.loadingText}>{creating ? 'Creating group…' : 'Loading groups…'}</Text>
                        </View>
                    ) : (
                        <ScrollView contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
                            {groups.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <View style={styles.emptyIconCircle}>
                                        <Feather name="users" size={32} color="#D1D5DB" />
                                    </View>
                                    <Text style={styles.emptyTitle}>No Groups Yet</Text>
                                    <Text style={styles.emptySubtitle}>Create a Friends or Family group above to control post visibility.</Text>
                                </View>
                            ) : (
                                groups.map((g) => (
                                    <GroupCard
                                        key={g._id}
                                        group={g}
                                        onGroupUpdated={(updated) => setGroups((prev) => prev.map((x) => x._id === updated._id ? updated : x))}
                                        onGroupDeleted={(id) => setGroups((prev) => prev.filter((x) => x._id !== id))}
                                    />
                                ))
                            )}
                            {hasFriends && hasFamily && (
                                <View style={styles.allDoneBadge}>
                                    <Feather name="check-circle" size={14} color="#10B981" />
                                    <Text style={styles.allDoneText}>All groups created</Text>
                                </View>
                            )}
                        </ScrollView>
                    )}
                </Animated.View>
            </View>

            {/* Create Group Modal */}
            <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
                <TouchableWithoutFeedback onPress={() => setShowCreateModal(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={styles.createModalContent}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Create New Group</Text>
                                    <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                                        <Feather name="x" size={20} color="#9CA3AF" />
                                    </TouchableOpacity>
                                </View>
                                
                                <Text style={styles.inputLabel}>Group Name</Text>
                                <TextInput
                                    style={styles.groupNameInput}
                                    placeholder="e.g. College Friends, Family, etc."
                                    placeholderTextColor="#9CA3AF"
                                    value={newGroupName}
                                    onChangeText={setNewGroupName}
                                    autoFocus
                                />

                                <View style={styles.typeSelectorRow}>
                                    {(['friends', 'family', 'custom'] as const).map((t) => (
                                        <TouchableOpacity 
                                            key={t}
                                            onPress={() => setNewGroupType(t)}
                                            style={[
                                                styles.typeOption, 
                                                newGroupType === t && { backgroundColor: COLORS[t].light, borderColor: COLORS[t].bg }
                                            ]}
                                        >
                                            <Text style={[
                                                styles.typeOptionText,
                                                newGroupType === t && { color: COLORS[t].text }
                                            ]}>
                                                {t.charAt(0).toUpperCase() + t.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TouchableOpacity 
                                    style={[styles.createSubmitBtn, !newGroupName.trim() && { opacity: 0.5 }]}
                                    onPress={() => handleCreate(newGroupType, newGroupName)}
                                    disabled={!newGroupName.trim() || creating}
                                >
                                    {creating ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.createSubmitText}>Create Group</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </Modal>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    drawer: {
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: DRAWER_WIDTH,
        backgroundColor: '#F9FAFB',
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
        elevation: 30,
    },

    // Header
    drawerHeader: {
        backgroundColor: '#0A2540',
        paddingTop: Platform.OS === 'ios' ? 56 : 32,
        paddingBottom: 20,
        paddingHorizontal: 20,
    },
    drawerHeaderTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    closeBtn: {
        width: 36, height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },
    drawerTitle: {
        fontSize: 18, fontWeight: '700', color: '#fff',
        letterSpacing: 0.2,
    },
    drawerSubtitle: {
        fontSize: 13, color: 'rgba(255,255,255,0.55)',
        marginBottom: 16,
    },
    headerCreateRow: {
        flexDirection: 'row', gap: 10,
    },
    headerCreateBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1, borderColor: '#4F8EF750',
    },
    headerCreateBtnText: {
        fontSize: 13, fontWeight: '600', color: '#93C5FD',
    },

    // Body
    bodyContent: { padding: 16, paddingBottom: 40 },
    loadingBox: {
        flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    loadingText: { color: '#9CA3AF', fontSize: 14 },

    // Empty state
    emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
    emptyIconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#F3F4F6',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 },
    emptySubtitle: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },

    // Group Card
    groupCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
        overflow: 'hidden',
    },
    groupCardHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 14, gap: 10,
    },
    groupCardIcon: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    groupCardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    groupCardMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
    typePill: {
        paddingHorizontal: 10, paddingVertical: 3,
        borderRadius: 20,
    },
    typePillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    deleteBtn: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: '#FEF2F2',
        marginLeft: 2,
    },
    groupCardBody: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#F3F4F6',
        paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10,
    },
    noMembersBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        marginBottom: 8,
    },
    noMembersText: {
        fontSize: 13,
        color: '#9CA3AF',
        fontWeight: '500',
    },

    // Member Card
    memberCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 7, paddingHorizontal: 10,
        backgroundColor: '#F9FAFB',
        borderRadius: 10, marginBottom: 6,
    },
    memberAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E5E7EB' },
    memberAvatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#DBEAFE' },
    memberAvatarInitials: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
    memberName: { flex: 1, fontSize: 13, fontWeight: '400', color: '#1F2937' },
    memberRemoveBtn: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center', justifyContent: 'center',
    },

    // Add Member Button
    addMemberBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginTop: 8, alignSelf: 'flex-start',
        paddingVertical: 7, paddingHorizontal: 12,
        borderRadius: 10, borderWidth: 1,
        backgroundColor: '#FAFAFA',
    },
    addMemberBtnIcon: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    addMemberBtnText: { fontSize: 13, fontWeight: '600' },

    // All done
    allDoneBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        justifyContent: 'center', marginTop: 8,
        paddingVertical: 8,
    },
    allDoneText: { fontSize: 13, color: '#10B981', fontWeight: '600' },

    // Add Member Modal
    addOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    addSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
        maxHeight: '82%',
    },
    addHandle: {
        width: 40, height: 4, backgroundColor: '#E5E7EB',
        borderRadius: 2, alignSelf: 'center', marginBottom: 16,
    },
    addSheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
    addSheetSub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 4, marginBottom: 16 },
    addSearchBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
        marginBottom: 12,
    },
    addSearchInput: { flex: 1, fontSize: 15, color: '#111827' },
    addUserRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
    },
    addUserAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E7EB' },
    addUserName: { fontSize: 14, fontWeight: '600', color: '#111827' },
    addUserHandle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    addUserBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: '#4F8EF7',
        alignItems: 'center', justifyContent: 'center',
    },
    addEmptyState: { alignItems: 'center', paddingTop: 40, gap: 8 },
    addEmptyText: { fontSize: 14, color: '#9CA3AF' },
    addCancelBtn: {
        marginTop: 16, paddingVertical: 13,
        backgroundColor: '#F3F4F6', borderRadius: 14, alignItems: 'center',
    },
    addCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
    
    // Create Group Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center',
        padding: 20,
    },
    createModalContent: {
        width: '100%', backgroundColor: '#fff',
        borderRadius: 24, padding: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
    },
    modalTitle: { fontSize: 19, fontWeight: '700', color: '#111827' },
    inputLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 8, marginLeft: 4 },
    groupNameInput: {
        width: '100%', backgroundColor: '#F3F4F6',
        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 16, color: '#111827', marginBottom: 20,
    },
    typeSelectorRow: {
        flexDirection: 'row', gap: 8, marginBottom: 24,
    },
    typeOption: {
        flex: 1, paddingVertical: 10, alignItems: 'center',
        borderRadius: 12, borderWidth: 1.5, borderColor: '#F3F4F6',
        backgroundColor: '#F9FAFB',
    },
    typeOptionText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
    createSubmitBtn: {
        backgroundColor: '#0A2540',
        paddingVertical: 15, borderRadius: 14,
        alignItems: 'center',
    },
    createSubmitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
