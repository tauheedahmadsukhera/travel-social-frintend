import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface VerifiedBadgeProps {
  size?: number;
  color?: string;
}

// Instagram check-decagram badge (Instagram Blue: #3897f0)
export default function VerifiedBadge({ size = 15, color = '#3897f0' }: VerifiedBadgeProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <MaterialCommunityIcons name="check-decagram" size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
