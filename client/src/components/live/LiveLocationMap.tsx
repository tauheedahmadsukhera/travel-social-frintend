import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

interface LiveLocationMapProps {
  location: any;
  manualLocation: any;
  onClose: () => void;
  MapView: any;
  Marker: any;
}

export const LiveLocationMap: React.FC<LiveLocationMapProps> = ({
  location,
  manualLocation,
  onClose,
  MapView,
  Marker,
}) => {
  return (
    <View style={styles.mapPanel}>
      <View style={styles.mapPanelHeader}>
        <Text style={styles.mapPanelTitle}>Stream Location</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {Platform.OS !== 'web' && MapView ? (
        <MapView
          style={styles.map}
          googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}
          mapType="standard"
          initialRegion={{
            latitude: (location || manualLocation)!.latitude,
            longitude: (location || manualLocation)!.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          provider={Platform.OS === 'ios' ? 'google' : undefined}
        >
          <Marker coordinate={(location || manualLocation)!} title="You are here" />
        </MapView>
      ) : (
        <View style={[styles.map, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: '#666' }}>Map is not available on web preview.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  mapPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  mapPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  mapPanelTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  map: { flex: 1 },
});
