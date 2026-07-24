import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

interface LiveStreamingOverlayProps {
  viewers: any[];
  viewerCount: number;
  onEndStream: () => void;
  onShowViewers: (v: boolean) => void;
  onShowStats: (v: boolean) => void;
  showStats: boolean;
  formatDuration: (s: number) => string;
  streamDuration: number;
  commentsCount: number;
  hasLocation: boolean;
  onToggleCameraFacing: () => void;
  onShare: () => void;
  onToggleComments: () => void;
  unreadCount: number;
  showComments: boolean;
  showMap: boolean;
  showViewers: boolean;
  canToggleComments: boolean;
  onToggleMap: () => void;
  insets: any;
}

export const LiveStreamingOverlay: React.FC<LiveStreamingOverlayProps> = ({
  viewers,
  viewerCount,
  onEndStream,
  onShowViewers,
  onShowStats,
  showStats,
  formatDuration,
  streamDuration,
  commentsCount,
  hasLocation,
  onToggleCameraFacing,
  onShare,
  onToggleComments,
  unreadCount,
  showComments,
  showMap,
  showViewers,
  canToggleComments,
  onToggleMap,
  insets,
}) => {
  return (
    <View style={styles.overlay}>
      <View style={[styles.figmaTopRow, { paddingTop: 12 + (insets?.top || 0) }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.viewersPill}
          onPress={() => onShowViewers(true)}
          activeOpacity={0.85}
        >
          <View style={styles.avatarStack}>
            {(Array.isArray(viewers) ? viewers : []).slice(0, 4).map((v, idx) => (
              <Image
                key={`${v?.id || idx}`}
                source={{ uri: v?.avatar || DEFAULT_AVATAR_URL }}
                style={[styles.avatarStackItem, { marginLeft: idx === 0 ? 0 : -10, zIndex: 10 - idx }]}
              />
            ))}
          </View>
          <Text style={styles.viewersPillText}>{viewerCount} Viewers</Text>
          <View style={styles.liveDotGreen} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.endPill} onPress={onEndStream} activeOpacity={0.9}>
          <Text style={styles.endPillText}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Panel */}
      {showStats && (
        <View style={styles.statsPanel}>
          <Text style={styles.statsTitle}>Stream Stats</Text>
          <Text style={styles.statsText}>👥 Viewers: {viewerCount}</Text>
          <Text style={styles.statsText}>💬 Comments: {commentsCount}</Text>
          <Text style={styles.statsText}>⏱️ Duration: {formatDuration(streamDuration)}</Text>
          <Text style={styles.statsText}>📍 Location: {hasLocation ? 'Enabled' : 'Disabled'}</Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View
        style={[styles.bottomBar, { paddingBottom: 16 + (insets?.bottom || 0) }]}
        pointerEvents={showComments ? 'box-none' : 'auto'}
      >
        <View pointerEvents={showComments ? 'none' : 'auto'}>
          <TouchableOpacity style={styles.controlButton} onPress={onToggleMap}>
            <Ionicons name="map" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View pointerEvents={showComments ? 'none' : 'auto'}>
          <TouchableOpacity style={styles.controlButton} onPress={onToggleCameraFacing}>
            <Ionicons name="camera" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={onToggleComments}
        >
          <Ionicons name="chatbubble" size={24} color="#fff" />
          {unreadCount > 0 && !showComments && !showMap && !showViewers && !showStats && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View pointerEvents={showComments ? 'none' : 'auto'}>
          <TouchableOpacity style={styles.controlButton} onPress={onShare}>
            <Ionicons
              name="paper-plane"
              size={22}
              color="#fff"
              style={{ transform: [{ rotate: '-25deg' }, { translateY: -1 }] }}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' },
  figmaTopRow: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, elevation: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  viewersPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)' },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  avatarStackItem: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  viewersPillText: { fontSize: 13, fontWeight: '600', color: '#fff', marginRight: 8 },
  liveDotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2ecc71' },
  endPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#ff4d4f' },
  endPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  statsPanel: { position: 'absolute', top: 70, right: 16, backgroundColor: 'rgba(0,0,0,0.8)', padding: 16, borderRadius: 12, minWidth: 200 },
  statsTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  statsText: { fontSize: 14, color: '#fff', marginTop: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50, elevation: 50, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, backgroundColor: 'transparent' },
  controlButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#e74c3c', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: 'bold' },
});
