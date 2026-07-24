import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

const { height } = Dimensions.get('window');

interface Viewer {
  id: string;
  name: string;
  avatar: string;
  location?: { latitude: number; longitude: number };
}

interface LiveViewersPanelProps {
  viewers: Viewer[];
  onClose: () => void;
  location: any;
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number;
}

export const LiveViewersPanel: React.FC<LiveViewersPanelProps> = ({
  viewers,
  onClose,
  location,
  calculateDistance,
}) => {
  const renderViewer = ({ item }: { item: Viewer }) => {
    let distance = '';
    if (location && item.location) {
      const km = calculateDistance(location.latitude, location.longitude, item.location.latitude, item.location.longitude);
      distance = `${km.toFixed(1)} km`;
    }

    return (
      <View style={styles.viewerItem}>
        <Image source={{ uri: item.avatar || DEFAULT_AVATAR_URL }} style={styles.viewerAvatar} />
        <View style={styles.viewerInfo}>
          <Text style={styles.viewerName}>{item.name}</Text>
          {distance && <Text style={styles.viewerDistance}>{distance} away</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.viewersPanel}>
      <View style={styles.viewersPanelHeader}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.viewersPanelTitle}>Viewers ({viewers.length})</Text>
      </View>

      <FlatList
        data={viewers}
        renderItem={renderViewer}
        keyExtractor={(item) => item.id}
        style={styles.viewersList}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  viewersPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  viewersPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  viewersPanelTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  viewersList: { flex: 1 },
  viewerItem: { flexDirection: 'row-reverse', justifyContent: 'flex-end', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  viewerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  viewerInfo: { flex: 1, justifyContent: 'center', alignItems: 'flex-end' },
  viewerName: { fontSize: 14, fontWeight: '600', color: '#000', textAlign: 'right' },
  viewerDistance: { fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
});
