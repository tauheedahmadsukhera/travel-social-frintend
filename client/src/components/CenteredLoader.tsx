import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function CenteredLoader({
  color = '#FF8D00',
  size = 'large',
}: {
  color?: string;
  size?: 'small' | 'large';
}) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

