import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const ErrorMessage = ({ message }: { message: string }) => (
  <View style={styles.container}>
    <Text style={styles.text}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#ffe5e5',
    borderRadius: 8,
    margin: 8,
  },
  text: {
    color: '#d32f2f',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default ErrorMessage;
