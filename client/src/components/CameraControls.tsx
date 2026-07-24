/**
 * Camera Controls Component
 * Provides UI for camera on/off, switch, flash, etc.
 */

import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface CameraControlsProps {
  onCameraToggle: (enabled: boolean) => void;
  onMicToggle: (enabled: boolean) => void;
  onCameraSwitch: () => void;
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  isFrontCamera: boolean;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  onCameraToggle,
  onMicToggle,
  onCameraSwitch,
  isCameraEnabled,
  isMicEnabled,
  isFrontCamera,
}) => {
  return (
    <View style={styles.container}>
      {/* Camera Toggle Button */}
      <TouchableOpacity
        style={[
          styles.button,
          !isCameraEnabled && styles.buttonDisabled,
        ]}
        onPress={() => onCameraToggle(!isCameraEnabled)}
      >
        <Feather
          name={isCameraEnabled ? 'video' : 'video-off'}
          size={24}
          color={isCameraEnabled ? '#fff' : '#999'}
        />
        <Text style={styles.buttonText}>
          {isCameraEnabled ? 'Camera On' : 'Camera Off'}
        </Text>
      </TouchableOpacity>

      {/* Microphone Toggle Button */}
      <TouchableOpacity
        style={[
          styles.button,
          !isMicEnabled && styles.buttonDisabled,
        ]}
        onPress={() => onMicToggle(!isMicEnabled)}
      >
        <Feather
          name={isMicEnabled ? 'mic' : 'mic-off'}
          size={24}
          color={isMicEnabled ? '#fff' : '#999'}
        />
        <Text style={styles.buttonText}>
          {isMicEnabled ? 'Mic On' : 'Mic Off'}
        </Text>
      </TouchableOpacity>

      {/* Camera Switch Button */}
      <TouchableOpacity
        style={styles.button}
        onPress={onCameraSwitch}
      >
        <Feather
          name="rotate-cw"
          size={24}
          color="#fff"
        />
        <Text style={styles.buttonText}>
          {isFrontCamera ? 'Front' : 'Back'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  button: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default CameraControls;
