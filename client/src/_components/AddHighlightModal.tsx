import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface AddHighlightModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (highlight: any) => void;
}
export default function AddHighlightModal({ visible, onClose, onAdd }: AddHighlightModalProps) {
  const [title, setTitle] = useState('');
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={onClose}
          />
          <View style={styles.container}>
            <Text style={styles.header}>Add Highlight</Text>
            <TextInput
              style={styles.input}
              placeholder="Highlight Title"
              value={title}
              onChangeText={setTitle}
            />
            <TouchableOpacity style={styles.addBtn} onPress={() => { onAdd(title); setTitle(''); onClose(); }}>
              <Ionicons name="add-circle" size={24} color="#FF6B00" />
              <Text style={styles.addText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color="#222" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#fff', borderRadius: 18, padding: 24, width: '80%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 },
  header: { fontWeight: '700', fontSize: 20, color: '#FF6B00', marginBottom: 16 },
  input: { width: '100%', borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, marginBottom: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF6B00', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20, marginBottom: 12 },
  addText: { color: '#fff', fontWeight: '600', fontSize: 16, marginLeft: 8 },
  closeBtn: { marginTop: 8 },
});