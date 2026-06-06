import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Pressable, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';
import AsyncStorage from '@/lib/storage';
import { apiService } from '@/src/_services/apiService';

interface VisibilityModalProps {
  visible: boolean;
  onClose: () => void;
  visibility: string;
  setVisibility: (v: string) => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  userGroups: any[];
  panHandlers: any;
}

const VisibilityModal: React.FC<VisibilityModalProps> = ({
  visible,
  onClose,
  visibility,
  setVisibility,
  selectedGroupId,
  setSelectedGroupId,
  userGroups: propGroups,
  panHandlers,
}) => {
  const [liveGroups, setLiveGroups] = useState<any[]>(propGroups || []);

  useEffect(() => {
    if (visible) {
      const fetchGroups = async () => {
        try {
          const uid = await AsyncStorage.getItem('userId');
          if (uid) {
            const res = await apiService.get(`/groups?userId=${uid}&_t=${Date.now()}`, { bypassDedupe: true });
            if (res?.success && Array.isArray(res.data)) {
              setLiveGroups(res.data);
            } else if (Array.isArray(res)) {
              setLiveGroups(res);
            }
          }
        } catch (err: any) {
          console.warn('[VisibilityModal] failed to fetch groups:', err);
          // Alert.alert('Error', err.message); // Uncomment if we need to see it on screen
        }
      };
      fetchGroups();
    }
  }, [visible]);

  return (
    <Modal 
      visible={visible} 
      animationType="slide" 
      transparent 
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        <View style={{
          backgroundColor: '#fff',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 32,
          minHeight: 300
        }}>
          <View 
            {...panHandlers}
            style={{ width: '100%', marginBottom: 8 }}
          >
            <View 
              style={{ width: '100%', height: 32, justifyContent: 'center' }}
            >
              <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center' }} />
            </View>
            <Text style={{ fontWeight: '500', fontSize: 16, color: '#000', textAlign: 'center' }}>Post visibility</Text>
          </View>

          {[
            { label: 'Everyone', type: 'everyone', groupId: null },
            ...liveGroups.map(g => ({
              label: g.name,
              type: g.type,
              groupId: g._id || g.id,
            })),
          ].map((option, idx) => {

            const isSelected = option.groupId
              ? selectedGroupId === option.groupId
              : visibility === 'Everyone' && !selectedGroupId;
            const iconName = option.type === 'everyone' ? 'globe' : 'users';
            return (
              <TouchableOpacity
                key={option.groupId || `everyone-${idx}`}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                onPress={() => {
                  hapticLight();
                  if (option.groupId) {
                    setVisibility(option.label);
                    setSelectedGroupId(option.groupId);
                  } else {
                    setVisibility('Everyone');
                    setSelectedGroupId(null);
                  }
                  onClose();
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: isSelected ? '#FF8D00' : '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <Feather name={iconName as any} size={20} color={isSelected ? '#fff' : '#000'} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{option.label}</Text>
                    {option.groupId && (
                      <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {liveGroups.find(g => (g._id || g.id) === option.groupId)?.members?.length ?? 0} members
                      </Text>
                    )}
                  </View>
                </View>
                {isSelected && (
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF8D00', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={14} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 4 }}>
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
    </Modal>
  );
};

export default React.memo(VisibilityModal);
