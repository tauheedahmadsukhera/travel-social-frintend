import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';

interface ProfileTabsProps {
  activeTab: 'grid' | 'map' | 'tagged';
  onChangeTab: (tab: 'grid' | 'map' | 'tagged') => void;
  mapEnabled?: boolean;
}

const ProfileTabs: React.FC<ProfileTabsProps> = ({ activeTab, onChangeTab, mapEnabled = false }) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'grid' && styles.activeTab]}
        onPress={() => { hapticLight(); onChangeTab('grid'); }}
      >
        <Ionicons name="grid-outline" size={24} color={activeTab === 'grid' ? '#000' : '#999'} />
      </TouchableOpacity>
      
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
  }
});

export default ProfileTabs;
