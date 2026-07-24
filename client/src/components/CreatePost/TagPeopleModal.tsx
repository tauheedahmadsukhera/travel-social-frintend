import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Pressable, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';
import { getModalHeight } from '@/src/utils/responsive';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

interface UserType {
  uid: string;
  displayName?: string;
  userName?: string;
  photoURL?: string | null;
}

interface TagPeopleModalProps {
  visible: boolean;
  onClose: () => void;
  userSearch: string;
  onSearchChange: (text: string) => void;
  loadingUserResults: boolean;
  userResults: UserType[];
  taggedUsers: UserType[];
  setTaggedUsers: (users: UserType[]) => void;
  panHandlers: any;
  iosSheetKeyboardOffset: number;
}

const TagPeopleModal: React.FC<TagPeopleModalProps> = ({
  visible,
  onClose,
  userSearch,
  onSearchChange,
  loadingUserResults,
  userResults,
  taggedUsers,
  setTaggedUsers,
  panHandlers,
  iosSheetKeyboardOffset,
}) => {
  return (
    <Modal 
      visible={visible} 
      animationType="slide" 
      transparent 
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={iosSheetKeyboardOffset}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
          <View style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            maxHeight: getModalHeight(0.85),
            minHeight: 450,
            overflow: 'hidden'
          }}>
            <View 
              {...panHandlers}
              style={{ paddingHorizontal: 20, paddingTop: 16 }}
            >
              <View style={{ width: '100%', height: 32, justifyContent: 'center' }}>
                <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center' }} />
              </View>
              <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 20, color: '#000', textAlign: 'center' }}>Tag someone</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
                <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 15, color: '#000' }}
                  placeholder="Search"
                  placeholderTextColor="#666"
                  value={userSearch}
                  onChangeText={onSearchChange}
                />
              </View>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 20 }}>
              {loadingUserResults ? (
                <ActivityIndicator size="small" color="#FF8D00" style={{ marginTop: 20 }} />
              ) : (
                <FlatList
                  data={userResults}
                  keyExtractor={item => item.uid}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  renderItem={({ item }) => {
                    const isSelected = taggedUsers.some(u => u.uid === item.uid);
                    return (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                        onPress={() => {
                          hapticLight();
                          if (!isSelected) setTaggedUsers([...taggedUsers, item]);
                          else setTaggedUsers(taggedUsers.filter(u => u.uid !== item.uid));
                        }}
                      >
                        <Image source={{ uri: item.photoURL || DEFAULT_AVATAR_URL }} style={{ width: 44, height: 44, borderRadius: 16, marginRight: 16, backgroundColor: '#eee' }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '400', color: '#111' }} numberOfLines={1}>{item.displayName || item.userName || item.uid}</Text>
                          {!!item.userName && <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }} numberOfLines={1}>@{item.userName}</Text>}
                        </View>
                        {isSelected && (
                          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF8D00', alignItems: 'center', justifyContent: 'center' }}>
                            <Feather name="check" size={14} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results</Text>}
                  contentContainerStyle={{ paddingBottom: 20 }}
                />
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  style={{ backgroundColor: '#FF8D00', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default React.memo(TagPeopleModal);
