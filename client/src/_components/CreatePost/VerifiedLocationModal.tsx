import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';
import { getModalHeight } from '@/utils/responsive';

interface LocationType {
  name: string;
  address: string;
  placeId?: string;
  lat: number;
  lon: number;
  verified?: boolean;
}

interface VerifiedLocationModalProps {
  visible: boolean;
  onClose: () => void;
  verifiedSearch: string;
  onSearchChange: (text: string) => void;
  loadingVerifiedResults: boolean;
  verifiedResults: LocationType[];
  verifiedOptions: LocationType[];
  verifiedLocation: LocationType | null;
  setVerifiedLocation: (location: LocationType | null) => void;
  getLocationKey: (loc: any) => string;
  verifiedCenter: any;
  panHandlers: any;
  iosSheetKeyboardOffset: number;
}

const VerifiedLocationModal: React.FC<VerifiedLocationModalProps> = ({
  visible,
  onClose,
  verifiedSearch,
  onSearchChange,
  loadingVerifiedResults,
  verifiedResults,
  verifiedOptions,
  verifiedLocation,
  setVerifiedLocation,
  getLocationKey,
  verifiedCenter,
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

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Feather name="lock" size={16} color="#000" style={{ marginRight: 8 }} />
                <Text style={{ fontWeight: '500', fontSize: 16, color: '#000' }}>Add a verified location</Text>
              </View>
              <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                To add a verified location you must be within 50 meters.
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
                <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 15, color: '#000' }}
                  placeholder="Search"
                  placeholderTextColor="#666"
                  value={verifiedSearch}
                  onChangeText={onSearchChange}
                />
              </View>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 20 }}>
              <FlatList
                data={[
                  { type: 'header_nearby', label: 'Nearby (100m)' },
                  ...(verifiedCenter ? [] : [{ type: 'error_location' }]),
                  ...(loadingVerifiedResults ? [{ type: 'loading' }] : verifiedResults),
                  { type: 'header_passport', label: 'Passport / GPS' },
                  ...verifiedOptions
                ]}
                keyExtractor={(item, idx) => {
                  if ('type' in item) return `ui-${(item as any).type}-${idx}`;
                  return getLocationKey(item) || String(idx);
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => {
                  if ('type' in item) {
                    const uiItem = item as any;
                    if (uiItem.type === 'header_nearby' || uiItem.type === 'header_passport') {
                      return <Text style={{ fontWeight: '700', fontSize: 14, color: '#111', marginTop: (uiItem.type === 'header_passport' ? 18 : 0), marginBottom: 8 }}>{uiItem.label}</Text>;
                    }
                    if (uiItem.type === 'error_location') {
                      return <Text style={{ color: '#888', marginBottom: 12, textAlign: 'left' }}>Enable location permissions to see nearby verified places.</Text>;
                    }
                    if (uiItem.type === 'loading') {
                      return <ActivityIndicator size="small" color="#0095f6" style={{ marginVertical: 10 }} />;
                    }
                    return null;
                  }

                  const isSelected = !!verifiedLocation && getLocationKey(verifiedLocation) === getLocationKey(item);
                  return (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                      onPress={() => {
                        hapticLight();
                        if (isSelected) setVerifiedLocation(null);
                        else setVerifiedLocation(item as any);
                      }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                        <Feather name="map-pin" size={18} color="#000" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: isSelected ? '#0095f6' : '#111' }}>{(item as any).name}</Text>
                        <Text style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{(item as any).address}</Text>
                      </View>
                      {isSelected && (
                        <Feather name="check" size={20} color="#0095f6" style={{ marginLeft: 10 }} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={(!loadingVerifiedResults && verifiedResults.length === 0 && verifiedOptions.length === 0) ? <Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results found</Text> : null}
              />
              
              <View style={{ 
                flexDirection: 'row', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                paddingVertical: 16
              }}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={onClose}
                    style={{ backgroundColor: '#000', borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Add</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onClose}
                    style={{ backgroundColor: '#0095f6', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default React.memo(VerifiedLocationModal);
