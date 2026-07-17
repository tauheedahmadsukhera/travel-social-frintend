import React from 'react';
import {
  Modal,
  View,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { isReadableLocationLabel } from '@/src/utils/passportUtils';

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  canSubmitManualStamps: boolean;
  onAddStamp: () => void;
  isAdding: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  locationLoading: boolean;
  nearbyPlaces: any[];
  areaGeo: { city: string; country: string; countryCode: string } | null;
  includeCityStamp: boolean;
  setIncludeCityStamp: React.Dispatch<React.SetStateAction<boolean>>;
  filteredPlaces: any[];
  selectedLocation: any;
  setSelectedLocation: React.Dispatch<React.SetStateAction<any>>;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  visible,
  onClose,
  canSubmitManualStamps,
  onAddStamp,
  isAdding,
  searchQuery,
  setSearchQuery,
  locationLoading,
  nearbyPlaces,
  areaGeo,
  includeCityStamp,
  setIncludeCityStamp,
  filteredPlaces,
  selectedLocation,
  setSelectedLocation,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ justifyContent: 'flex-end', flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalBottomSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ width: 120, alignItems: 'flex-start' }}>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
                  <Text style={styles.modalCloseText}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Select location
              </Text>
              <View style={{ width: 120, alignItems: 'flex-end' }}>
                {canSubmitManualStamps && (
                  <TouchableOpacity style={styles.modalAddBtn} onPress={onAddStamp} disabled={isAdding}>
                    {isAdding ? (
                      <ActivityIndicator size="small" color="#fff" style={{ width: 24, height: 16 }} />
                    ) : (
                      <Text style={styles.modalAddText}>Add</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.modalSearchContainer}>
              <Feather name="search" size={18} color="#FF8D00" style={{ marginRight: 12 }} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search places"
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                editable={!locationLoading}
                onSubmitEditing={() => Keyboard.dismiss()}
                returnKeyType="search"
              />
            </View>

            {/* Locations list */}
            {locationLoading && nearbyPlaces.length === 0 && !areaGeo ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="large" color="#FF8D00" />
                <Text style={styles.modalLoadingText}>Fetching nearby locations...</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalLocationsList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20 }}
              >
                {areaGeo && isReadableLocationLabel(areaGeo.city) && (
                  <TouchableOpacity
                    style={[styles.cityStampRow, includeCityStamp && styles.cityStampRowSelected]}
                    onPress={() => setIncludeCityStamp((v) => !v)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cityStampRowLeft}>
                      <View style={[styles.selectionRadio, includeCityStamp && styles.selectionRadioSelected]}>
                        {includeCityStamp ? <Feather name="check" size={16} color="#fff" /> : null}
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.cityStampRowTitle}>City stamp</Text>
                        <Text style={styles.cityStampRowName}>{areaGeo.city}</Text>
                        <Text style={styles.cityStampRowHint}>Current area — add without picking a venue</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 12 }}>
                  <Text style={styles.modallocationLabel}>Nearby places (~200 m)</Text>
                  {locationLoading && <ActivityIndicator size="small" color="#FF8D00" style={{ marginLeft: 8 }} />}
                </View>
                {filteredPlaces.length === 0 ? (
                  <View style={styles.modalEmptyInline}>
                    <Feather name="map-pin" size={36} color="#ddd" />
                    <Text style={styles.modalEmptyText}>
                      {locationLoading
                        ? 'Loading nearby venues…'
                        : nearbyPlaces.length === 0
                        ? 'No venues in ~200 m — you can still add a city stamp above.'
                        : 'No results matching your search'}
                    </Text>
                  </View>
                ) : (
                  filteredPlaces.map((place, index) => (
                    <TouchableOpacity
                      key={place.placeId || index}
                      style={[
                        styles.locationItem,
                        selectedLocation?.placeId === place.placeId && styles.locationItemSelected,
                      ]}
                      onPress={() => setSelectedLocation((prev: any) => (prev?.placeId === place.placeId ? null : place))}
                    >
                      <View style={styles.locationItemLeft}>
                        <View style={styles.locationIcon}>
                          <Feather name="map-pin" size={18} color="#FF8D00" />
                        </View>
                        <View style={styles.locationItemText}>
                          <Text style={styles.locationName}>{place.placeName}</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <Text style={styles.locationAddress}>{place.address || ''}</Text>
                          </ScrollView>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.selectionRadio,
                          selectedLocation?.placeId === place.placeId && styles.selectionRadioSelected,
                        ]}
                      >
                        {selectedLocation?.placeId === place.placeId && <Feather name="check" size={16} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  modalCloseBtn: {
    paddingVertical: 4,
  },
  modalCloseText: {
    color: '#FF8D00',
    fontSize: 16,
    fontWeight: '600',
  },
  modalAddBtn: {
    backgroundColor: '#FF8D00',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modalAddText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
  modalLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  modalLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  modalLocationsList: {
    flex: 1,
    marginTop: 8,
  },
  modallocationLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cityStampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  cityStampRowSelected: {
    borderColor: '#FF8D00',
    backgroundColor: '#F0F6FA',
  },
  cityStampRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityStampRowTitle: {
    fontSize: 12,
    color: '#FF8D00',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cityStampRowName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  cityStampRowHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  locationItemSelected: {
    backgroundColor: '#fafafa',
  },
  locationItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F6FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locationItemText: {
    flex: 1,
    paddingRight: 16,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 13,
    color: '#888',
  },
  selectionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionRadioSelected: {
    backgroundColor: '#FF8D00',
    borderColor: '#FF8D00',
  },
  modalEmptyInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  modalEmptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
