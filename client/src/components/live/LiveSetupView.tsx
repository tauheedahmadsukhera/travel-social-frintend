import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// We'll import these if we move them to a common location, or pass them as props.
// For now, let's assume they are passed as props to keep the component flexible.

interface LiveSetupViewProps {
  streamTitle: string;
  setStreamTitle: (text: string) => void;
  isInitializing: boolean;
  location: any;
  manualLocation: any;
  manualLocationLabel: string;
  onStartStream: () => void;
  onOpenLocationPicker: () => void;
  onRetryLocation: () => void;
  onBack: () => void;
}

export const LiveSetupView: React.FC<LiveSetupViewProps> = ({
  streamTitle,
  setStreamTitle,
  isInitializing,
  location,
  manualLocation,
  manualLocationLabel,
  onStartStream,
  onOpenLocationPicker,
  onRetryLocation,
  onBack,
}) => {
  const effectiveLocation = location || manualLocation;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Go Live</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.setupContainer}>
        <View style={styles.setupCard}>
          <Text style={styles.setupLabel}>Stream Title</Text>
          <TextInput
            style={styles.setupInput}
            placeholder="Enter stream title..."
            value={streamTitle}
            onChangeText={setStreamTitle}
            maxLength={100}
          />
          <Text style={styles.setupHint}>
            💡 Tip: Use a catchy title to attract more viewers!
          </Text>
        </View>

        <View style={styles.setupCard}>
          <Text style={styles.setupLabel}>📍 Location</Text>
          <Text style={styles.setupValue}>
            {effectiveLocation
              ? (manualLocation ? (manualLocationLabel || `${effectiveLocation.latitude.toFixed(4)}, ${effectiveLocation.longitude.toFixed(4)}`) : `${effectiveLocation.latitude.toFixed(4)}, ${effectiveLocation.longitude.toFixed(4)}`)
              : 'Location not detected yet'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.locationActionBtn, styles.locationActionPrimary]}
              onPress={onOpenLocationPicker}
            >
              <Ionicons name="map" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.locationActionTextPrimary}>Open Map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.locationActionBtn, styles.locationActionSecondary]}
              onPress={onRetryLocation}
            >
              <Ionicons name="locate" size={16} color="#667eea" style={{ marginRight: 6 }} />
              <Text style={styles.locationActionTextSecondary}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.setupCard}>
          <Text style={styles.setupLabel}>ℹ️ Stream Info</Text>
          <Text style={styles.setupInfo}>• Your stream will be visible to all users</Text>
          <Text style={styles.setupInfo}>• Viewers can comment and interact</Text>
          <Text style={styles.setupInfo}>• Stream will be saved for 24 hours</Text>
        </View>

        <TouchableOpacity
          style={[styles.startButton, isInitializing && styles.startButtonDisabled]}
          onPress={onStartStream}
          disabled={isInitializing}
        >
          {isInitializing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="videocam" size={24} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.startButtonText}>Start Live Stream</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  setupContainer: { flex: 1 },
  setupCard: { backgroundColor: '#fff', margin: 16, padding: 16, borderRadius: 12 },
  setupLabel: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 8 },
  setupInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  setupHint: { marginTop: 8, fontSize: 14, color: '#666' },
  setupValue: { fontSize: 14, color: '#666' },
  locationActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  locationActionPrimary: { backgroundColor: '#667eea' },
  locationActionSecondary: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe' },
  locationActionTextPrimary: { color: '#fff', fontWeight: '700', fontSize: 13 },
  locationActionTextSecondary: { color: '#667eea', fontWeight: '700', fontSize: 13 },
  setupInfo: { fontSize: 14, color: '#666', marginTop: 4 },
  startButton: { backgroundColor: '#667eea', margin: 16, padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
});
