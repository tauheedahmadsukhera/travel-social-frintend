import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@/lib/storage';
import { apiService } from '../_services/apiService';
import { getUserSectionsSorted } from '../../lib/firebaseHelpers/getUserSectionsSorted';
import { addUserSection, deleteUserSection, updateUserSection } from '../../lib/firebaseHelpers/index';
import { updateUserSectionsOrder } from '../../lib/firebaseHelpers/updateUserSectionsOrder';

type Section = {
  _id?: string;
  name: string;
  postIds: string[];
  coverImage?: string;
  visibility?: 'public' | 'private' | 'specific';
  collaborators?: any[];
  allowedUsers?: string[]; // IDs for specific visibility
  allowedGroups?: string[]; // Group IDs for specific visibility
  userId?: string; // Owner ID
};

type Post = {
  _id: string;
  id?: string;
  imageUrl?: string;
  imageUrls?: string[];
};

type EditSectionsModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string; // The owner of the sections being viewed/edited
  currentUserId: string; // The logged-in user
  sections: Section[];
  posts: Post[];
  onSectionsUpdate: (sections: Section[]) => void;
};

export default function EditSectionsModal({
  visible,
  onClose,
  userId,
  currentUserId,
  sections,
  posts,
  onSectionsUpdate,
}: EditSectionsModalProps) {
  const [selectedSectionForEdit, setSelectedSectionForEdit] = useState<string | null>(null);
  const [sectionMode, setSectionMode] = useState<'select' | 'cover' | 'visibility' | 'collaborators'>('select');
  const [newSectionName, setNewSectionName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [collaboratorInput, setCollaboratorInput] = useState('');

  // Groups and Followers for Visibility/Collabs
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [tempSelectedGroups, setTempSelectedGroups] = useState<string[]>([]);

  const isOwner = userId === currentUserId;
  const selectedSection = sections.find(s => s.name === selectedSectionForEdit);
  const isCollaborator = selectedSection?.collaborators?.includes(currentUserId);
  const canManagePosts = isOwner || isCollaborator;

  const normalizeSections = (data: any): Section[] => {
    const arr = Array.isArray(data) ? data : [];
    return arr
      .map((s: any) => ({
        _id: typeof s?._id === 'string' ? s._id : undefined,
        name: String(s?.name || ''),
        postIds: (Array.isArray(s?.postIds) ? s.postIds : []).filter((id: any): id is string => typeof id === 'string'),
        coverImage: typeof s?.coverImage === 'string' ? s.coverImage : undefined,
        visibility: (s?.visibility === 'public' || s?.visibility === 'private' || s?.visibility === 'specific') ? s.visibility : 'private',
        collaborators: Array.isArray(s?.collaborators) ? s.collaborators : [],
        allowedUsers: Array.isArray(s?.allowedUsers) ? s.allowedUsers : [],
        allowedGroups: Array.isArray(s?.allowedGroups) ? s.allowedGroups : [],
        userId: s?.userId,
      }))
      .filter((s: Section) => !!s.name);
  };

  const handleCreateSection = async () => {
    if (!newSectionName.trim() || !userId) {
      console.log('âŒ Cannot create section - missing name or userId:', { newSectionName, userId });
      return;
    }

    console.log('ðŸ“ Creating section:', newSectionName.trim(), 'for user:', userId);

    const createResult = await addUserSection(userId, { name: newSectionName.trim(), postIds: [], visibility: 'public', collaborators: [], allowedGroups: [] });
    console.log('âœ… Create section result:', createResult);

    const res = await getUserSectionsSorted(userId);
    console.log('ðŸ“‹ Fetched sections after create:', res);
    console.log('ðŸ“‹ Response data type:', Array.isArray(res.data) ? 'array' : typeof res.data);
    console.log('ðŸ“‹ Response data.data type:', res.data?.data ? (Array.isArray(res.data.data) ? 'array' : typeof res.data.data) : 'undefined');

    if (res.success && res.data) {
      const sectionsData = Array.isArray(res.data) ? res.data : (Array.isArray(res.data.data) ? res.data.data : []);
      console.log('âœ… Updating sections in UI:', sectionsData.length, 'sections');
      console.log('âœ… Section names:', sectionsData.map((s: any) => s.name || s._id));
      onSectionsUpdate(normalizeSections(sectionsData));
    } else {
      console.error('âŒ Failed to fetch sections:', res);
    }

    setNewSectionName('');
    setShowCreateInput(false);
  };

  const handleDeleteSection = async (sectionName: string) => {
    if (!userId || !isOwner) return;
    Alert.alert('Delete section', `Delete "${sectionName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteUserSection(userId, sectionName);
          const res = await getUserSectionsSorted(userId);
          if (res.success && res.data) {
            const sectionsData = Array.isArray(res.data) ? res.data : (Array.isArray(res.data.data) ? res.data.data : []);
            onSectionsUpdate(normalizeSections(sectionsData));
          }
          if (selectedSectionForEdit === sectionName) {
            setSelectedSectionForEdit(null);
          }
        },
      },
    ]);
  };

  const handleSelectSection = (sectionName: string) => {
    // Toggle: if same section clicked again, close it; otherwise open the new section
    if (selectedSectionForEdit === sectionName) {
      setSelectedSectionForEdit(null);
    } else {
      Keyboard.dismiss();
      setSelectedSectionForEdit(sectionName);
      setSectionMode('select');
      
      // Reset temp states for this section
      const section = sections.find(s => s.name === sectionName);
      if (section) {
          setTempSelectedGroups(section.allowedGroups || []);
      }
    }
  };

  const loadGroups = async () => {
    if (!currentUserId) return;
    setLoadingGroups(true);
    try {
      const res = await apiService.get(`/groups?userId=${currentUserId}`);
      if (res?.success && Array.isArray(res.data)) setGroups(res.data);
    } catch (e) {
      console.error('loadGroups error', e);
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadFollowers = async () => {
    if (!currentUserId) return;
    setLoadingFollowers(true);
    try {
      const res = await apiService.get(`/users/${currentUserId}/followers`);
      const list = res?.data || res || [];
      setFollowers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('loadFollowers error', e);
    } finally {
      setLoadingFollowers(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (collaboratorInput.trim().length > 1) {
        setSearching(true);
        try {
          const res = await apiService.get(`/users/search?q=${encodeURIComponent(collaboratorInput)}&requesterUserId=${currentUserId}`);
          if (res?.success && Array.isArray(res.data)) {
            const normalized = res.data.map((u: any) => ({
              ...u,
              uid: u._id || u.firebaseUid,
              name: u.displayName || u.name || 'User',
              avatar: u.avatar || u.photoURL || u.profilePicture || ''
            }));
            setSearchResults(normalized);
          }
        } catch (e) { console.error('search error', e); }
        finally { setSearching(false); }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [collaboratorInput, currentUserId]);

  useEffect(() => {
    if (visible && currentUserId) {
      loadGroups();
      loadFollowers();
    }
  }, [visible, currentUserId]);

  const handlePostSelection = async (post: Post) => {
    if (!userId || !selectedSectionForEdit) return;
    const section = sections.find(s => s.name === selectedSectionForEdit);
    if (!section) return;

    const postId = post._id || post.id;
    if (!postId) return;
    console.log('Post selected:', postId, 'Mode:', sectionMode);

    if (sectionMode === 'cover') {
      const uri = post.imageUrl || post.imageUrls?.[0];
      console.log('Setting cover image:', uri);
      
      // Cover is just a thumbnail, don't add post to section automatically
      // Update local state immediately for instant feedback
      const updatedSections = sections.map(s => 
        s.name === selectedSectionForEdit 
          ? { ...s, coverImage: uri }
          : s
      );
      onSectionsUpdate(updatedSections);
      
      // Then save to Firebase - use section._id if available, otherwise name
      const sectionIdentifier = section._id || section.name;
      console.log('ðŸ’¾ Updating section with ID/name:', sectionIdentifier);
      const result = await updateUserSection(userId, sectionIdentifier, {
        name: section.name,
        postIds: section.postIds,
        coverImage: uri,
        visibility: section.visibility,
        collaborators: section.collaborators,
        allowedUsers: section.allowedUsers,
        allowedGroups: (section as any).allowedGroups
      }, currentUserId);
      console.log('âœ… Cover update result:', result);
      
      // Refresh from Firebase to ensure consistency
      const res = await getUserSectionsSorted(userId);
      console.log('ðŸ“‹ Fetched sections after cover update:', res);
      if (res.success && res.data) {
        const sectionsData = Array.isArray(res.data) ? res.data : (Array.isArray(res.data.data) ? res.data.data : []);
        console.log('ðŸ“‹ Extracted sections data:', sectionsData.length, 'sections');
        if (sectionsData.length > 0) {
          onSectionsUpdate(normalizeSections(sectionsData));
        } else {
          console.warn('âš ï¸ Sections data is empty, keeping current state');
        }
      } else {
        console.error('âŒ Failed to fetch sections after update:', res);
      }
    } else {
      const safePostIds = (Array.isArray(section.postIds) ? section.postIds : []).filter((id): id is string => typeof id === 'string');
      const newPostIds = safePostIds.includes(postId)
        ? safePostIds.filter(id => id !== postId)
        : [...safePostIds, postId];
      console.log('ðŸ“ Updating postIds:', newPostIds);
      
      // Update local state immediately for instant feedback
      const updatedSections = sections.map(s => 
        s.name === selectedSectionForEdit 
          ? { ...s, postIds: newPostIds }
          : s
      );
      onSectionsUpdate(updatedSections);
      
      // Then save to Firebase - use section._id if available, otherwise name
      const sectionIdentifier = section._id || section.name;
      console.log('ðŸ’¾ Updating section with ID/name:', sectionIdentifier);
      const result = await updateUserSection(userId, sectionIdentifier, {
        name: section.name,
        postIds: newPostIds,
        coverImage: section.coverImage,
        visibility: section.visibility,
        collaborators: section.collaborators,
        allowedUsers: section.allowedUsers,
        allowedGroups: (section as any).allowedGroups
      }, currentUserId);
      console.log('âœ… Post selection update result:', result);
      
      // Refresh from Firebase to ensure consistency
      const res = await getUserSectionsSorted(userId);
      console.log('ðŸ“‹ Fetched sections after post update:', res);
      if (res.success && res.data) {
        const sectionsData = Array.isArray(res.data) ? res.data : (Array.isArray(res.data.data) ? res.data.data : []);
        console.log('ðŸ“‹ Extracted sections data:', sectionsData.length, 'sections');
        if (sectionsData.length > 0) {
          onSectionsUpdate(normalizeSections(sectionsData));
        } else {
          console.warn('âš ï¸ Sections data is empty, keeping current state');
        }
      } else {
        console.error('âŒ Failed to fetch sections after update:', res);
      }
    }
  };

  const handleSave = () => {
    Keyboard.dismiss();
    setSelectedSectionForEdit(null);
    setSectionMode('select');
    setShowCreateInput(false);
    setCollaboratorInput('');
    onClose();
  };

  const handleClearAll = () => {
    setSelectedSectionForEdit(null);
    setSectionMode('select');
  };

  const renameSection = async (oldName: string, newName: string) => {
    if (!userId || !isOwner) return;
    if (!newName.trim() || newName === oldName) return;
    const section = sections.find(s => s.name === oldName);
    if (!section) return;
    const sectionIdentifier = section._id || section.name;
    await updateUserSection(userId, sectionIdentifier, {
      name: newName.trim(),
      postIds: section.postIds || [],
      coverImage: section.coverImage,
      visibility: section.visibility,
      collaborators: section.collaborators,
      allowedUsers: section.allowedUsers,
      allowedGroups: section.allowedGroups
    }, currentUserId);
    await deleteUserSection(userId, oldName);
    const res = await getUserSectionsSorted(userId);
    if (res.success && res.data) {
      const sectionsData = Array.isArray(res.data) ? res.data : (Array.isArray(res.data.data) ? res.data.data : []);
      onSectionsUpdate(normalizeSections(sectionsData));
    }
  };

  const handleReorderSections = async (data: Section[]) => {
    onSectionsUpdate(data);
    // Save order to Firebase
    if (userId && isOwner) {
      await updateUserSectionsOrder(userId, data);
    }
  };

  const handleToggleVisibility = async (sectionName: string, v?: 'public' | 'private' | 'specific') => {
    if (!userId || !isOwner) return;
    const section = sections.find(s => s.name === sectionName);
    if (!section) return;

    const newVisibility = v || (section.visibility === 'private' ? 'public' : 'private');

    // If specific, we might need to handle allowedUsers later
    const updatedSections = sections.map(s =>
      s.name === sectionName ? { ...s, visibility: newVisibility } : s
    );
    onSectionsUpdate(updatedSections);

    const sectionIdentifier = section._id || section.name;
    await updateUserSection(userId, sectionIdentifier, {
      name: section.name,
      postIds: section.postIds,
      coverImage: section.coverImage,
      visibility: newVisibility,
      collaborators: section.collaborators,
      allowedUsers: section.allowedUsers,
      allowedGroups: section.allowedGroups // Pass existing or updated
    }, currentUserId);
  };

  const updateSectionAllowedUsers = async (sectionName: string, allowedUsers: string[]) => {
    if (!userId || !isOwner) return;
    const section = sections.find(s => s.name === sectionName);
    if (!section) return;

    const updatedSections = sections.map(s =>
      s.name === sectionName ? { ...s, allowedUsers } : s
    );
    onSectionsUpdate(updatedSections);

    const sectionIdentifier = section._id || section.name;
    await updateUserSection(userId, sectionIdentifier, {
      name: section.name,
      postIds: section.postIds,
      coverImage: section.coverImage,
      visibility: section.visibility,
      collaborators: section.collaborators,
      allowedUsers: allowedUsers,
      allowedGroups: tempSelectedGroups // Sync groups too
    }, currentUserId);
  };

  const toggleGroupSelection = (group: any) => {
    const section = sections.find(s => s.name === selectedSectionForEdit);
    if (!section) return;

    setTempSelectedGroups(prev => {
      const exists = prev.some(sid => String(sid) === String(group._id));
      const nextGroups = exists 
        ? prev.filter(sid => String(sid) !== String(group._id)) 
        : [...prev, String(group._id)];
      
      // Calculate resulting allowedUsers
      let allMembers: string[] = [];
      groups.filter(g => nextGroups.some(sid => String(sid) === String(g._id))).forEach(g => {
        if (Array.isArray(g.members)) allMembers = [...allMembers, ...g.members];
      });
      const uniqueMembers = [...new Set(allMembers)];
      
      updateSectionAllowedUsers(section.name, uniqueMembers);
      return nextGroups;
    });
  };

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

  const handleAddCollaboratorById = async (targetId: string) => {
    if (!userId || !isOwner || !selectedSectionForEdit || !targetId) return;
    const section = sections.find(s => s.name === selectedSectionForEdit);
    if (!section) return;

    // Check if already a collaborator (could be ID or object)
    const exists = section.collaborators?.some((c: any) => isSameUser(c, targetId));
    if (exists) return;

    const newCollaborators = [...(section.collaborators || []), targetId];
    const updatedSections = sections.map(s =>
      s.name === selectedSectionForEdit ? { ...s, collaborators: newCollaborators } : s
    );
    onSectionsUpdate(updatedSections);

    const sectionIdentifier = section._id || section.name;
    await updateUserSection(userId, sectionIdentifier, {
      name: section.name,
      postIds: section.postIds,
      coverImage: section.coverImage,
      visibility: section.visibility,
      collaborators: newCollaborators,
      allowedUsers: section.allowedUsers,
      allowedGroups: tempSelectedGroups
    }, currentUserId);
  };

  const handleAddCollaborator = async () => {
      // Legacy support for text input if needed, but we mostly use by ID now
      handleAddCollaboratorById(collaboratorInput.trim());
      setCollaboratorInput('');
  };

  const handleRemoveCollaborator = async (collabId: string) => {
    if (!userId || !isOwner || !selectedSectionForEdit) return;
    const section = sections.find(s => s.name === selectedSectionForEdit);
    if (!section) return;

    const newCollaborators = (section.collaborators || []).filter((c: any) => !isSameUser(c, collabId));
    const updatedSections = sections.map(s =>
      s.name === selectedSectionForEdit ? { ...s, collaborators: newCollaborators } : s
    );
    onSectionsUpdate(updatedSections);

    const sectionIdentifier = section._id || section.name;
    await updateUserSection(userId, sectionIdentifier, {
      name: section.name,
      postIds: section.postIds,
      coverImage: section.coverImage,
      visibility: section.visibility,
      collaborators: newCollaborators,
      allowedUsers: section.allowedUsers,
      allowedGroups: tempSelectedGroups
    }, currentUserId);
  };

  const renderSectionItem = ({ item, drag }: RenderItemParams<Section>) => (
    <SectionRow
      item={item}
      isSelected={selectedSectionForEdit === item.name}
      onPress={() => handleSelectSection(item.name)}
      onDelete={() => handleDeleteSection(item.name)}
      onRename={renameSection}
      onToggleVisibility={() => handleToggleVisibility(item.name)}
      drag={drag}
      isOwner={isOwner}
    />
  );

  // Safety check: Don't render if no userId
  if (!userId) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
              <Text style={styles.title}>Edit sections</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {/* Create new section button */}
              {!showCreateInput && isOwner ? (
                <TouchableOpacity
                  style={styles.createSectionBtn}
                  onPress={() => setShowCreateInput(true)}
                >
                  <Ionicons name="add" size={20} color="#000" style={{ marginRight: 8 }} />
                  <Text style={styles.createSectionText}>Create a new section</Text>
                </TouchableOpacity>
              ) : (isOwner && showCreateInput) ? (
                <View style={styles.createInputContainer}>
                  <TextInput
                    style={styles.createInput}
                    placeholder="Section name"
                    value={newSectionName}
                    onChangeText={setNewSectionName}
                    autoFocus
                    onSubmitEditing={handleCreateSection}
                  />
                  <TouchableOpacity onPress={handleCreateSection} style={styles.createConfirmBtn}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowCreateInput(false); setNewSectionName(''); }} style={styles.createCancelBtn}>
                    <Ionicons name="close" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
              ) : null}

          {/* Draggable Sections list */}
          <View style={{ minHeight: sections.length * 80 }}>
            <DraggableFlatList
              data={sections}
              onDragEnd={({ data }) => handleReorderSections(data)}
              keyExtractor={(item) => item.name}
              renderItem={renderSectionItem}
              scrollEnabled={false}
              dragItemOverflow={true}
            />
          </View>

          {/* Section management instructions */}
          {selectedSectionForEdit && (
            <View style={styles.managementSection}>
              {canManagePosts ? (
                <Text style={styles.instructionTitle}>Select post below to add to this section</Text>
              ) : (
                <Text style={styles.instructionTitle}>Viewing posts in this section</Text>
              )}
              {canManagePosts && (
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    style={[styles.modeBtn, sectionMode === 'select' && styles.modeBtnActive]}
                    onPress={() => setSectionMode('select')}
                  >
                    <Text style={[styles.modeBtnText, sectionMode === 'select' && styles.modeBtnTextActive]}>
                      Select posts
                    </Text>
                  </TouchableOpacity>
                  {isOwner && (
                    <>
                      <TouchableOpacity
                        style={[styles.modeBtn, sectionMode === 'visibility' && styles.modeBtnActive]}
                        onPress={() => setSectionMode('visibility')}
                      >
                        <Text style={[styles.modeBtnText, sectionMode === 'visibility' && styles.modeBtnTextActive]}>
                          Visibility
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeBtn, sectionMode === 'collaborators' && styles.modeBtnActive]}
                        onPress={() => setSectionMode('collaborators')}
                      >
                        <Text style={[styles.modeBtnText, sectionMode === 'collaborators' && styles.modeBtnTextActive]}>
                          Invite
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {sectionMode === 'visibility' && isOwner && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.instructionTitle}>Who can see this collection?</Text>
                  <View style={styles.visibilityOptions}>
                    {['public', 'private'].map((v: any) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.visOpt, selectedSection?.visibility === v && styles.visOptActive]}
                        onPress={() => handleToggleVisibility(selectedSection!.name, v)}
                      >
                        <Ionicons 
                          name={v === 'public' ? 'globe-outline' : 'lock-closed-outline'} 
                          size={16} 
                          color={selectedSection?.visibility === v ? '#fff' : '#666'} 
                        />
                        <Text style={[styles.visOptText, selectedSection?.visibility === v && styles.visOptTextActive]}>
                          {v.charAt(0) + v.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {sectionMode === 'collaborators' && isOwner && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.instructionTitle}>Invite Collaborators</Text>
                  <View style={[styles.searchWrapEdit, { height: 46, borderRadius: 23, backgroundColor: '#f5f7fa', borderWidth: 1, borderColor: '#eef0f2', marginVertical: 8 }]}>
                    <Ionicons name="search" size={18} color="#FF8D00" style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.searchInputEdit, { fontSize: 15 }]}
                      placeholder="Search people to invite..."
                      placeholderTextColor="#99aab5"
                      value={collaboratorInput}
                      onChangeText={setCollaboratorInput}
                      autoFocus={false}
                    />
                    {collaboratorInput.length > 0 && (
                      <TouchableOpacity onPress={() => setCollaboratorInput('')}>
                        <Ionicons name="close-circle" size={18} color="#ccc" />
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <ScrollView style={{ maxHeight: 200, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                    {searching ? (
                      <ActivityIndicator size="small" color="#FF8D00" />
                    ) : (collaboratorInput.trim().length > 1 ? searchResults : followers.filter(f => 
                        (f.name || f.username || '').toLowerCase().includes(collaboratorInput.toLowerCase())
                      )).map(f => {
                        const isCollab = selectedSection?.collaborators?.some((c: any) => isSameUser(c, f));
                        return (
                          <TouchableOpacity
                            key={f._id || f.uid || f.firebaseUid}
                            style={styles.followerRowEdit}
                            onPress={() => isCollab ? handleRemoveCollaborator(f.firebaseUid || f.uid || f._id) : handleAddCollaboratorById(f.firebaseUid || f.uid || f._id)}
                          >
                            <ExpoImage source={{ uri: f.avatar }} style={styles.followerAvatarEdit} />
                            <Text style={styles.followerNameEdit}>{f.name || f.username}</Text>
                            <Ionicons
                              name={isCollab ? "remove-circle" : "add-circle"}
                              size={24}
                              color={isCollab ? "#ff3b30" : "#4CAF50"}
                            />
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>
              )}

              {(sectionMode === 'select' || sectionMode === 'cover') && (
                <View style={styles.grid}>
                  {posts.map((p) => {
                    const postId = p._id || p.id;
                    const section = sections.find(s => s.name === selectedSectionForEdit);
                    if (!postId) return null;
                    const safeSectionPostIds = (Array.isArray(section?.postIds) ? section?.postIds : []).filter((id): id is string => typeof id === 'string');
                    const isSelected = sectionMode === 'select' && safeSectionPostIds.includes(postId);
                    const isCoverSelected = sectionMode === 'cover' && section?.coverImage === (p.imageUrl || p.imageUrls?.[0]);
                    const imageUri = p.imageUrl || p.imageUrls?.[0];
                    return (
                      <TouchableOpacity
                        key={postId}
                        style={styles.gridItem}
                        activeOpacity={0.7}
                        onPress={() => canManagePosts && handlePostSelection(p)}
                        disabled={!canManagePosts}
                      >
                        <ExpoImage
                          source={{ uri: imageUri }}
                          style={styles.gridImage}
                          contentFit="cover"
                          transition={200}
                        />
                        {isSelected && (
                          <View style={styles.checkmark}>
                            <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                          </View>
                        )}
                        {isCoverSelected && (
                          <View style={styles.coverBadge}>
                            <Ionicons name="star" size={20} color="#FFD700" />
                            <Text style={styles.coverBadgeText}>Cover</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Bottom actions */}
          {canManagePosts && (
            <View style={styles.bottomActions}>
              <TouchableOpacity onPress={handleClearAll}>
                <Text style={styles.clearText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          )}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

type SectionRowProps = {
  item: Section;
  isSelected: boolean;
  onPress: () => void;
  onDelete: () => void;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onToggleVisibility: () => void;
  drag: () => void;
  isOwner: boolean;
};

const SectionRow = ({ item, isOwner, isSelected, onPress, onDelete, onRename, onToggleVisibility, drag }: SectionRowProps) => {
  const [editing, setEditing] = useState(false);
  const [sectionName, setSectionName] = useState(item.name);

  useEffect(() => {
    setSectionName(item.name);
  }, [item.name]);

  const handleNameUpdate = async () => {
    const trimmed = sectionName.trim();
    if (!trimmed || !isOwner) {
      setSectionName(item.name);
      setEditing(false);
      return;
    }
    await onRename(item.name, trimmed);
    setEditing(false);
  };

  const isPrivate = item.visibility === 'private';

  return (
    <ScaleDecorator>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity
          onLongPress={isOwner ? drag : undefined}
          style={[styles.dragHandle, isSelected && { marginRight: 0 }]}
          disabled={!isOwner}
        >
          <Ionicons name="menu" size={24} color={isOwner ? "#999" : "#eee"} />
        </TouchableOpacity>
        {isSelected ? (
          <View style={styles.selectedSectionCard}>
            <TouchableOpacity
              activeOpacity={1}
              onLongPress={() => setEditing(true)}
              style={styles.selectedSectionInputWrap}
            >
              <TextInput
                style={styles.selectedSectionInput}
                value={sectionName}
                editable={editing && isOwner}
                onChangeText={setSectionName}
                onBlur={handleNameUpdate}
                onSubmitEditing={handleNameUpdate}
                selectTextOnFocus={editing && isOwner}
              />
            </TouchableOpacity>
            <View style={styles.selectedSectionActions}>
              <View style={styles.selectedSectionActionRow}>
                <Ionicons name="albums-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.selectedSectionActionText}>{item.postIds?.length || 0} Posts</Text>
              </View>
              
              <TouchableOpacity style={styles.selectedSectionActionRow} onPress={onToggleVisibility} disabled={!isOwner}>
                <Ionicons name={isPrivate ? "lock-closed-outline" : "globe-outline"} size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.selectedSectionActionText}>{isPrivate ? "Private" : "Public"} Collection</Text>
              </TouchableOpacity>

              {isOwner && (
                <TouchableOpacity key="delete-action" style={styles.selectedSectionActionRow} onPress={onDelete}>
                  <Ionicons name="trash-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.selectedSectionActionText}>Delete this section</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.sectionRowSimple}
            onPress={onPress}
            onLongPress={isOwner ? drag : undefined}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.sectionRowTitle}>{item.name}</Text>
                  {isPrivate && <Ionicons name="lock-closed" size={12} color="#666" style={{ marginLeft: 4 }} />}
                </View>
                <Text style={styles.sectionRowCount}>{item.postIds?.length || 0} Posts</Text>
              </View>
              {item.collaborators && item.collaborators.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="people" size={14} color="#666" style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 12, color: '#666' }}>{item.collaborators.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
      </View>
    </ScaleDecorator>
  );
};

const styles = StyleSheet.create({
    selectedSectionCard: {
      flex: 1,
      backgroundColor: '#FF8D00',
      borderRadius: 16,
      borderWidth: 2,
      borderColor: '#FF8D00',
      padding: 12,
      justifyContent: 'center',
      shadowColor: '#FF8D00',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    selectedSectionInputWrap: {
      backgroundColor: '#fff',
      borderRadius: 8,
      marginBottom: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    selectedSectionInput: {
      fontSize: 16,
      fontWeight: '600',
      color: '#222',
      paddingVertical: 6,
      paddingHorizontal: 2,
      backgroundColor: 'transparent',
    },
    selectedSectionActions: {
      marginTop: 2,
    },
    selectedSectionActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    selectedSectionActionText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '500',
    },
    sectionRowSimple: {
      flex: 1,
      backgroundColor: 'transparent',
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 8,
      justifyContent: 'center',
    },
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  closeBtn: { padding: 8 },
  title: { fontSize: 16, fontWeight: '600', color: '#000' },
  content: { padding: 16 },
  createSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  createSectionText: { fontSize: 15, fontWeight: '500' },
  createInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  createInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  createConfirmBtn: {
    backgroundColor: '#FF8D00',
    padding: 8,
    borderRadius: 8,
  },
  createCancelBtn: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    paddingVertical: 16,
    paddingLeft: 4,
    paddingRight: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  sectionRowActive: {
    backgroundColor: '#fff4e6',
    borderWidth: 2,
    borderColor: '#FF8D00',
  },
  sectionRowDragging: {
    backgroundColor: '#fff',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dragHandle: {
    padding: 8,
    marginLeft: -8,
    marginRight: 4,
  },
  sectionRowContent: {
    flex: 1,
    paddingLeft: 8,
  },
  sectionRowTitle: { fontSize: 15, fontWeight: '600', color: '#000' },
  sectionRowCount: { fontSize: 13, color: '#666', marginTop: 2 },
  deleteBtn: { padding: 8 },
  deleteText: { color: '#ff3b30', fontSize: 13, fontWeight: '500' },
  managementSection: { marginTop: 24 },
  instructionTitle: { fontSize: 14, fontWeight: '600', color: '#000' },
  modeToggle: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: '#FF8D00' },
  modeBtnText: { fontSize: 13, fontWeight: '500', color: '#000' },
  modeBtnTextActive: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  gridItem: { width: '33.3333%', aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%' },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  coverBadgeText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingBottom: 40,
  },
  clearText: { fontSize: 16, color: '#666' },
  saveBtn: {
    backgroundColor: '#FF8D00',
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  collaboratorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
    followerNameEdit: {
      fontSize: 14,
      color: '#333',
      flex: 1,
    },
    visibilityOptions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    visOpt: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: '#f0f0f0',
      gap: 6,
    },
    visOptActive: {
      backgroundColor: '#FF8D00',
    },
    visOptText: {
      fontSize: 12,
      color: '#666',
      fontWeight: '500',
    },
    visOptTextActive: {
      color: '#fff',
    },
    specificGroups: {
      backgroundColor: '#fdfdfd',
      padding: 10,
      borderRadius: 8,
      marginTop: 8,
      borderWidth: 1,
      borderColor: '#f0f0f0',
    },
    groupRowEdit: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      gap: 10,
    },
    groupNameEdit: {
      fontSize: 14,
      color: '#444',
    },
    groupNameSelectedEdit: {
      color: '#FF8D00',
      fontWeight: '600',
    },
    infoText: {
      fontSize: 12,
      color: '#999',
      fontStyle: 'italic',
    },
    searchWrapEdit: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f5f7fa',
      borderRadius: 23,
      paddingHorizontal: 16,
      marginTop: 8,
      marginHorizontal: 16,
      height: 46,
      borderWidth: 1,
      borderColor: '#eef0f2',
    },
    searchInputEdit: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 8,
      fontSize: 14,
    },
    followerRowEdit: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#eee',
      gap: 12,
    },
    followerAvatarEdit: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#eee',
    },
  collaboratorText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
});
