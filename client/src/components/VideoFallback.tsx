// Fallback component for video rendering issues
import React from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';

type VideoFallbackProps = {
  connectionStatus: string;
  initializeViewer: () => void;
  reconnectAttemptsRef?: React.MutableRefObject<any>;
};

export default function VideoFallback({ connectionStatus, initializeViewer, reconnectAttemptsRef }: VideoFallbackProps) {
  const [showError, setShowError] = React.useState(false);

  React.useEffect(() => {
    // Show error if video not rendered after 8 seconds
    const timeout = setTimeout(() => setShowError(true), 8000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <ActivityIndicator size="large" color="#fff" style={{ marginBottom: 10 }} />
      <Text style={{ color: '#fff', fontSize: 16 }}>
        {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connecting to live stream...'}
      </Text>
      <Text style={{ color: '#aaa', fontSize: 12, marginTop: 5 }}>
        {connectionStatus === 'reconnecting' ? 'Attempting reconnect...' : 'Please wait'}
      </Text>
      {showError && (
        <View style={{ marginTop: 20, padding: 16, backgroundColor: '#ff6b6b', borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>
            Video not rendering. This is usually a device or system issue. Try:
            {'\n'}- Restarting the app
            {'\n'}- Switching WiFi/data
            {'\n'}- Testing on another device
            {'\n'}- Updating the app/OS
            {'\n'}- If problem persists, update Agora SDK or check device compatibility.
          </Text>
        </View>
      )}
      {connectionStatus === 'disconnected' && (
        <TouchableOpacity 
          style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#ff6b6b', borderRadius: 8 }}
          onPress={() => {
            if (typeof reconnectAttemptsRef !== 'undefined' && reconnectAttemptsRef.current) reconnectAttemptsRef.current = 0;
            initializeViewer();
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
