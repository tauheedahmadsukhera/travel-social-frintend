import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert, Animated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { uploadMedia } from '../lib/firebaseHelpers/messages';

export function useDMMedia() {
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingObj, setRecordingObj] = useState<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  
  const isStartingRecordingRef = useRef(false);
  const isStoppingRecordingRef = useRef(false);

  useEffect(() => {
    if (recording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(micPulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      micPulseAnim.setValue(1);
    }
  }, [recording]);

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to send images.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.7,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (res.canceled) return null;
    const asset = res.assets[0];
    if (asset.fileSize && asset.fileSize > 100 * 1024 * 1024) {
      Alert.alert('File Too Large', 'Please select an image or video smaller than 100MB.');
      return null;
    }
    return asset;
  }, []);

  const handleLaunchCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to capture and send photos.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.7,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (res.canceled) return null;
    const asset = res.assets[0];
    if (asset.fileSize && asset.fileSize > 100 * 1024 * 1024) {
      Alert.alert('File Too Large', 'Please select an image or video smaller than 100MB.');
      return null;
    }
    return asset;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (isStartingRecordingRef.current) return;
      isStartingRecordingRef.current = true;
      
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone access is required to send voice messages.');
        isStartingRecordingRef.current = false;
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecordingObj(newRecording);
      setRecording(true);
      setRecordingDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording', err);
    } finally {
      isStartingRecordingRef.current = false;
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingObj || isStoppingRecordingRef.current) return null;
    isStoppingRecordingRef.current = true;

    try {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      
      setRecording(false);
      await recordingObj.stopAndUnloadAsync();
      const uri = recordingObj.getURI();
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      setRecordingObj(null);
      return { uri, duration: recordingDuration };
    } catch (err) {
      console.error('Failed to stop recording', err);
      return null;
    } finally {
      isStoppingRecordingRef.current = false;
    }
  }, [recordingObj, recordingDuration]);

  return {
    recording,
    recordingDuration,
    micPulseAnim,
    handlePickImage,
    handleLaunchCamera,
    startRecording,
    stopRecording
  };
}
