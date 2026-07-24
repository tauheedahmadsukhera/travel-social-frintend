import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';

interface ProfileTabsProps {
  activeTab: 'grid' | 'map' | 'tagged' | 'saved';
  onChangeTab: (tab: 'grid' | 'map' | 'tagged' | 'saved') => void;
  mapEnabled?: boolean;
  onViewCollections?: () => void;
}

const ProfileTabs: React.FC<ProfileTabsProps> = ({ activeTab, onChangeTab, mapEnabled = false, onViewCollections }) => {
  return (
    <View style={styles.container}>

      {mapEnabled && (
        <TouchableOpacity
          style={[styles.tab, activeTab === 'map' && styles.activeTab]}
          onPress={() => { hapticLight(); onChangeTab('map'); }}
        >
          <Ionicons name="location-outline" size={24} color={activeTab === 'map' ? '#000' : '#999'} />
        </TouchableOpacity>
      )}
      
      <TouchableOpacity
        style={[styles.tab, activeTab === 'tagged' && styles.activeTab]}
        onPress={() => { hapticLight(); onChangeTab('tagged'); }}
      >
        <Ionicons name="pricetag-outline" size={24} color={activeTab === 'tagged' ? '#000' : '#999'} />
      </TouchableOpacity>

      {onViewCollections && (
        <TouchableOpacity
          style={[styles.tab]}
          onPress={() => { hapticLight(); onViewCollections(); }}
        >
          <Ionicons name="folder-outline" size={24} color="#999" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: '#f5f5f5',
  }
});

export default ProfileTabs;
