import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';

interface FollowButtonProps {
  status: 'none' | 'pending' | 'approved';
  loading: boolean;
  onPress: () => void;
}

const FollowButton: React.FC<FollowButtonProps> = ({ status, loading, onPress }) => {
  const [optimisticStatus, setOptimisticStatus] = React.useState<typeof status | null>(null);

  React.useEffect(() => {
    // Reset optimistic state when actual status is synced from server
    setOptimisticStatus(null);
  }, [status]);

  const currentStatus = optimisticStatus !== null ? optimisticStatus : status;

  let label = 'Follow';
  if (currentStatus === 'pending') label = 'Requested';
  if (currentStatus === 'approved') label = 'Following';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        currentStatus === 'approved' && styles.buttonFollowing,
        currentStatus === 'pending' && styles.buttonPending
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        // Optimistic transition
        if (currentStatus === 'none') {
          setOptimisticStatus('approved');
        } else {
          setOptimisticStatus('none');
        }
        onPress();
      }}
      disabled={loading}
    >
      {loading && optimisticStatus === null ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.text, currentStatus !== 'none' && styles.textFollowing]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FF8D00',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonFollowing: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#d0d0d0',
  },
  buttonPending: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  textFollowing: {
    color: '#666',
  },
});

export default FollowButton;
