import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomButton from '@/src/_components/auth/CustomButton';

export default function PasswordResetSuccessScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={60} color="#fff" />
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Password Reset Successfully!</Text>
          <Text style={styles.subtitle}>
            Your password has been changed successfully. You can now login with your new password.
          </Text>
        </View>

        {/* Login Button */}
        <CustomButton
          title="Login Now"
          onPress={() => router.replace('/auth/login-options')}
          variant="primary"
          style={styles.loginButton}
        />

        {/* Back to Home */}
        <CustomButton
          title="Back to Home"
          onPress={() => router.replace('/(tabs)/home')}
          variant="secondary"
          style={styles.homeButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 10,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  loginButton: {
    marginBottom: 12,
  },
  homeButton: {
    marginBottom: 20,
  },
});
