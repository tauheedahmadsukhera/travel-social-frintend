import React from 'react';
import { StyleSheet, Text, View, ViewStyle, Animated } from 'react-native';
import { useOfflineBanner } from '../../hooks/useOffline';

interface Props {
  text?: string;
  style?: ViewStyle;
}

/**
 * Intelligent Offline Banner
 * Automatically appears when connection is lost and shows a success state when restored.
 */
export function OfflineBanner({ style }: Props) {
  const { showBanner, isOnline } = useOfflineBanner();

  if (!showBanner) return null;

  return (
    <View 
      style={[
        styles.banner, 
        isOnline ? styles.online : styles.offline,
        style
      ]}
    >
      <Text style={styles.text}>
        {isOnline ? '✓ Back online' : '⚠ No internet connection — showing saved content'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  offline: {
    backgroundColor: '#1F2937', // Dark gray for offline
    borderWidth: 1,
    borderColor: '#374151',
  },
  online: {
    backgroundColor: '#10B981', // Emerald green for restored
  },
  text: { 
    color: '#FFFFFF', 
    fontWeight: '700', 
    textAlign: 'center',
    fontSize: 13,
  },
});
