import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadImage } from '../../lib/firebaseHelpers';
import { checkUsernameAvailability, signUpWithUsername } from '../../services/usernameAuthService';
import { AuthBrandHeader } from '@/src/_components/auth/AuthBrandHeader';
import CustomButton from '@/src/_components/auth/CustomButton';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function UsernameSignUpScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Check username availability with debounce
  useEffect(() => {
    if (!username || username.trim().length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      const available = await checkUsernameAvailability(username);
      setUsernameAvailable(available);
      setCheckingUsername(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const pickImage = async () => {
    // Request permission
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission required', 'Please allow access to your photos');
      return;
    }

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const handleNext = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    if (username.trim().length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }

    if (usernameAvailable === false) {
      Alert.alert('Error', 'Username is not available');
      return;
    }

    setLoading(true);

    try {
      let avatarUrl: string | undefined = undefined;

      // Upload profile image if selected
      if (profileImage) {
        const uploadResult = await uploadImage(profileImage, `avatars/${username}_${Date.now()}`);
        if (uploadResult.success && uploadResult.url) {
          avatarUrl = uploadResult.url;
        }
      }

      // Sign up with username
      const result = await signUpWithUsername(username, name, avatarUrl);

      if (result.success) {
        // No success popup (Instagram-like)
        router.replace('/auth/login-options');
      } else {
        Alert.alert('Sign-Up Failed', result.error || 'Could not create account');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => safeRouterBack()}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {/* Title Section */}
            <View style={styles.titleSection}>
              <AuthBrandHeader
                title="Your profile is now verified"
                subtitle={`Let's keep it quick, 2 steps and you're in.`}
              />
            </View>

            {/* Avatar Placeholder */}
            <View style={styles.avatarContainer}>
              <TouchableOpacity
                style={styles.avatarPlaceholder}
                onPress={pickImage}
              >
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person-outline" size={40} color="#999" />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={pickImage} style={styles.editIconContainer}>
                <Ionicons name="camera" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Username Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Create a username</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="username"
                  placeholderTextColor="#999"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  editable={!loading}
                />
                {checkingUsername && (
                  <ActivityIndicator size="small" color="#0A3D62" style={styles.inputIcon} />
                )}
                {!checkingUsername && usernameAvailable === true && username.length >= 3 && (
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" style={styles.inputIcon} />
                )}
                {!checkingUsername && usernameAvailable === false && username.length >= 3 && (
                  <Ionicons name="close-circle" size={20} color="#f44336" style={styles.inputIcon} />
                )}
              </View>
              {username.length >= 3 && usernameAvailable === false && (
                <Text style={[styles.hint, { color: '#f44336' }]}>This username is not available</Text>
              )}
              {username.length >= 3 && usernameAvailable === true && (
                <Text style={[styles.hint, { color: '#4CAF50' }]}>Username is available!</Text>
              )}
              {username.length > 0 && username.length < 3 && (
                <Text style={styles.hint}>Username must be at least 3 characters</Text>
              )}
            </View>

            {/* Name Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Next Button */}
            <CustomButton
              title={loading ? 'Creating Account...' : 'Next'}
              onPress={handleNext}
              variant="primary"
              style={styles.nextButton}
              disabled={loading || !username || usernameAvailable === false}
            />

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#0A3D62" />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 10,
  },
  header: {
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  checkIcon: {
    fontSize: 32,
    color: '#0A3D62',
    marginBottom: 12,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 15,
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    backgroundColor: '#0A3D62',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  inputContainer: {
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: '#000',
    marginBottom: 8,
    fontWeight: '600',
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#000',
    flex: 1,
    paddingRight: 45,
  },
  inputIcon: {
    position: 'absolute',
    right: 15,
  },
  hint: {
    fontSize: 12,
    color: '#0A3D62',
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  nextButton: {
    marginTop: 5,
  },
});

