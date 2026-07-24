import React from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface StampDeleteModalProps {
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
  stampName?: string;
}

export const StampDeleteModal: React.FC<StampDeleteModalProps> = ({
  visible,
  onClose,
  onDelete,
  deleting,
  stampName,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.deleteOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.deleteSheet}>
          <View style={styles.deleteHeader}>
            <View style={styles.deleteIcon}>
              <Feather name="trash-2" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.deleteTitle}>Delete stamp?</Text>
              <Text style={styles.deleteSub} numberOfLines={2}>
                {stampName ? `This will remove “${stampName}” from your passport.` : 'This will remove this stamp from your passport.'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <TouchableOpacity style={[styles.deleteBtn, deleting && { opacity: 0.7 }]} onPress={onDelete} disabled={deleting}>
              <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteCancelBtn} onPress={onClose} disabled={deleting}>
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  deleteSheet: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  deleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff3b30',
  },
  deleteTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
  },
  deleteSub: {
    marginTop: 3,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  deleteBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  deleteCancelBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  deleteCancelText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 15,
  },
});
