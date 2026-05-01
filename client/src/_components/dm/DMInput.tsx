import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Animated } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

type DMInputProps = {
  input: string;
  setInput: (text: string) => void;
  onSend: () => void;
  onMediaPress: () => void;
  onCameraPress: () => void;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
  recording: boolean;
  recordingDuration: number;
  micPulseAnim: Animated.Value;
  replyingTo: any;
  onCancelReply: () => void;
  sending: boolean;
};

const DMInput: React.FC<DMInputProps> = ({
  input,
  setInput,
  onSend,
  onMediaPress,
  onCameraPress,
  onMicPressIn,
  onMicPressOut,
  recording,
  recordingDuration,
  micPulseAnim,
  replyingTo,
  onCancelReply,
  sending,
}) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyContent}>
            <Text style={styles.replyLabel}>Replying to {replyingTo.senderId === 'self' ? 'yourself' : 'them'}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyingTo.text}</Text>
          </View>
          <TouchableOpacity onPress={onCancelReply}>
            <Feather name="x" size={16} color="#8e8e8e" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {!input.trim() && !recording && (
          <TouchableOpacity style={styles.iconBtn} onPress={onCameraPress}>
            <View style={styles.cameraCircle}>
              <Feather name="camera" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.inputContainer}>
          {recording ? (
            <View style={styles.recordingRow}>
              <Animated.View style={[styles.recordingDot, { opacity: micPulseAnim }]} />
              <Text style={styles.recordingText}>{formatDuration(recordingDuration)}</Text>
              <Text style={styles.recordingHint}>Recording...</Text>
            </View>
          ) : (
            <TextInput
              style={styles.textInput}
              placeholder="Message..."
              placeholderTextColor="#8e8e8e"
              value={input}
              onChangeText={setInput}
              multiline
            />
          )}

          {!input.trim() && !recording && (
            <View style={styles.rightIcons}>
              <TouchableOpacity style={styles.innerIcon} onPress={onMicPressIn}>
                <Feather name="mic" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.innerIcon} onPress={onMediaPress}>
                <Feather name="image" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.innerIcon}>
                <Feather name="plus-circle" size={20} color="#000" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {(input.trim() || recording) && (
          <TouchableOpacity 
            style={styles.sendBtn} 
            onPress={recording ? onMicPressOut : onSend}
            disabled={sending}
          >
            <Text style={styles.sendBtnText}>
              {recording ? 'Release to send' : (sending ? '...' : 'Send')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0095f6',
  },
  replyContent: {
    flex: 1,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0095f6',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginRight: 8,
  },
  cameraCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0095f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 22,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    paddingVertical: 8,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  innerIcon: {
    marginLeft: 12,
  },
  sendBtn: {
    marginLeft: 12,
  },
  sendBtnText: {
    color: '#0095f6',
    fontWeight: '700',
    fontSize: 16,
  },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginRight: 10,
  },
  recordingHint: {
    fontSize: 14,
    color: '#8e8e8e',
  },
});

export default React.memo(DMInput);
