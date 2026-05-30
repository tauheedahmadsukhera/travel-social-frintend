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
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stamp } from '@/lib/firebaseHelpers/passport';

interface StampSearchModalProps {
  visible: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (text: string) => void;
  searchResults: Stamp[];
  onPickStamp: (stamp: Stamp) => void;
}

export const StampSearchModal: React.FC<StampSearchModalProps> = ({
  visible,
  onClose,
  searchQuery,
  setSearchQuery,
  searchResults,
  onPickStamp,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.searchModalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }}
        >
          <View style={styles.searchModalContent}>
            <View style={styles.modalHandle} />

            <View style={styles.searchModalHeader}>
              <View>
                <Text style={styles.searchModalTitle}>Search Passport</Text>
                <Text style={styles.searchModalSub}>Find your travel milestones</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.searchModalCloseBtn}>
                <Feather name="x" size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBarWrapper}>
              <View style={styles.searchBarInner}>
                <Feather name="search" size={18} color="#0A3D62" />
                <TextInput
                  style={styles.searchBarInput}
                  placeholder="Search countries, cities, or places..."
                  placeholderTextColor="#999"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {!!searchQuery && Platform.OS === 'android' && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Feather name="x-circle" size={16} color="#ccc" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView
              style={styles.searchResultsList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  searchResults.map((s) => (
                    <TouchableOpacity
                      key={`ss_${String(s._id)}`}
                      style={styles.searchResultItem}
                      onPress={() => onPickStamp(s)}
                    >
                      <View style={styles.searchResultIcon}>
                        <Feather
                          name={s.type === 'country' ? 'globe' : s.type === 'city' ? 'map' : 'map-pin'}
                          size={16}
                          color="#0A3D62"
                        />
                      </View>
                      <View style={styles.searchResultText}>
                        <Text style={styles.searchResultName}>{s.name}</Text>
                        <Text style={styles.searchResultInfo}>
                          {s.type.charAt(0).toUpperCase() + s.type.slice(1)}
                          {s.parentCity ? ` • ${s.parentCity}` : ''}
                          {s.parentCountry ? ` • ${s.parentCountry}` : ''}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#CCC" />
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.searchEmptyState}>
                    <Feather name="search" size={48} color="#EEE" />
                    <Text style={styles.searchEmptyText}>No stamps match your search</Text>
                    <Text style={styles.searchEmptySub}>Try searching for a different location</Text>
                  </View>
                )
              ) : (
                <View style={styles.searchPlaceholderState}>
                  <View style={styles.searchHistoryIcon}>
                    <Feather name="compass" size={24} color="#CCC" />
                  </View>
                  <Text style={styles.searchPlaceholderText}>Start typing to search your passport</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  searchModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  searchModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 12,
  },
  searchModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
  },
  searchModalSub: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  searchModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchBarInput: {
    flex: 1,
    height: '100%',
    marginLeft: 8,
    fontSize: 15,
    color: '#111',
  },
  searchResultsList: {
    flex: 1,
    paddingTop: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  searchResultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  searchResultInfo: {
    fontSize: 13,
    color: '#666',
  },
  searchPlaceholderState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  searchHistoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  searchPlaceholderText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  searchEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  searchEmptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 16,
  },
  searchEmptySub: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});
