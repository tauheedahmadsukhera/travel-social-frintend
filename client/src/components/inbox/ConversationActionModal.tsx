import React, { useState, useEffect } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface ConversationActionModalProps {
  actionsVisible: boolean;
  closeActions: () => void;
  actionTitle: string;
  setActionsVisible: (visible: boolean) => void;
  confirmDeleteVisible: boolean;
  setConfirmDeleteVisible: (visible: boolean) => void;
  handleDelete: () => void;
}

export const ConversationActionModal: React.FC<ConversationActionModalProps> = ({
  actionsVisible,
  closeActions,
  actionTitle,
  setActionsVisible,
  confirmDeleteVisible,
  setConfirmDeleteVisible,
  handleDelete,
}) => {
  // Single-modal approach: use internal mode to switch content
  const [mode, setMode] = useState<'actions' | 'confirm'>('actions');

  // Derive visibility: show if either parent flag is true
  const isVisible = actionsVisible || confirmDeleteVisible;

  // Sync mode with parent state
  useEffect(() => {
    if (confirmDeleteVisible) {
      setMode('confirm');
    } else if (actionsVisible) {
      setMode('actions');
    }
  }, [actionsVisible, confirmDeleteVisible]);

  // Reset mode when modal closes
  useEffect(() => {
    if (!isVisible) {
      // Small delay to let fade-out finish before resetting
      const t = setTimeout(() => setMode('actions'), 200);
      return () => clearTimeout(t);
    }
  }, [isVisible]);

  const handleClose = () => {
    setActionsVisible(false);
    setConfirmDeleteVisible(false);
  };

  const handleDeleteTap = () => {
    // Switch to confirm view within the same modal (no modal transition)
    setActionsVisible(false);
    setConfirmDeleteVisible(true);
    setMode('confirm');
  };

  const handleConfirmDelete = () => {
    // Close modal first, then trigger delete after animation
    handleClose();
    setTimeout(() => {
      handleDelete();
    }, 100);
  };

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.actionSheetBackdrop} onPress={handleClose}>
        {mode === 'actions' ? (
          <Pressable style={styles.actionSheetContainer} onPress={() => {}}>
            <Text style={styles.actionSheetTitle} numberOfLines={1}>
              {actionTitle || 'Conversation'}
            </Text>

            <TouchableOpacity
              style={[styles.actionSheetButton, styles.actionSheetDeleteButton]}
              activeOpacity={0.8}
              onPress={handleDeleteTap}
            >
              <Feather name="trash-2" size={18} color="#ff3b30" />
              <Text style={[styles.actionSheetButtonText, styles.actionSheetDeleteText]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionSheetButton, styles.actionSheetCancelButton]}
              activeOpacity={0.8}
              onPress={handleClose}
            >
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        ) : (
          <Pressable style={styles.confirmContainer} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Delete conversation?</Text>
            <Text style={styles.confirmSubtitle}>This will remove the conversation from your inbox.</Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmCancelBtn]}
                onPress={handleClose}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, styles.confirmDeleteBtn]} onPress={handleConfirmDelete}>
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: '#fff',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  actionSheetTitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    marginBottom: 10,
  },
  actionSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionSheetButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#111',
    fontWeight: '600',
  },
  actionSheetDeleteButton: {
    marginTop: 2,
  },
  actionSheetDeleteText: {
    color: '#ff3b30',
  },
  actionSheetCancelButton: {
    marginTop: 10,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  actionSheetCancelText: {
    fontSize: 16,
    color: '#111',
    fontWeight: '700',
  },
  confirmContainer: {
    marginHorizontal: 22,
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    marginBottom: 6,
  },
  confirmSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 14,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginLeft: 10,
  },
  confirmCancelBtn: {
    backgroundColor: '#f5f5f5',
  },
  confirmCancelText: {
    fontWeight: '700',
    color: '#111',
  },
  confirmDeleteBtn: {
    backgroundColor: '#ff3b30',
  },
  confirmDeleteText: {
    fontWeight: '800',
    color: '#fff',
  },
});

