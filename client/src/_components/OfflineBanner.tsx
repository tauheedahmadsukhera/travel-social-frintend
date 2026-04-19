import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

export function OfflineBanner({
  text = "You’re offline — showing saved content",
  style,
}: {
  text?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    opacity: 0.92,
  },
  text: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});

