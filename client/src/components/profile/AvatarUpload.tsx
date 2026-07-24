import React from 'react';
import { Image, StyleSheet, TouchableOpacity } from 'react-native';

interface AvatarUploadProps {
  avatar: string;
  onPickImage: () => void;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({ avatar, onPickImage }) => (
  <TouchableOpacity style={styles.avatarContainer} onPress={onPickImage}>
    <Image source={{ uri: avatar }} style={styles.avatar} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  avatarContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#eee' },
});

export default AvatarUpload;
