import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

interface PrivacyModalProps {
  visible: boolean;
  onClose: () => void;
  isPrivate: boolean;
  onToggle: () => void;
}
export default function PrivacyModal({ visible, onClose, isPrivate, onToggle }: PrivacyModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.header}>Privacy Settings</Text>
          <View style={styles.row}>
            <Ionicons name="lock-closed-outline" size={24} color="#FF6B00" style={{ marginRight: 12 }} />
            <Text style={styles.label}>Private Account</Text>
            <Switch value={isPrivate} onValueChange={onToggle} thumbColor="#FF6B00" />
          </View>
          <Text style={styles.info}>When your account is private, only approved followers can see your posts and send you messages. Others can only send follow requests.</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#222" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#fff', borderRadius: 18, padding: 24, width: '80%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 },
  header: { fontWeight: '700', fontSize: 20, color: '#FF6B00', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  label: { fontSize: 16, color: '#222', fontWeight: '600', marginRight: 12 },
  info: { fontSize: 13, color: '#666', marginBottom: 16, textAlign: 'center' },
  closeBtn: { marginTop: 8 },
});