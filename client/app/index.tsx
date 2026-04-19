import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveCanonicalUserId } from '../lib/currentUser';

function SkeletonCard(): React.ReactElement {
  return (
    <View style={{ paddingVertical: 10, backgroundColor: '#fff' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#eee' }} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <View style={{ width: '46%', height: 10, borderRadius: 5, backgroundColor: '#eee', marginBottom: 8 }} />
          <View style={{ width: '32%', height: 10, borderRadius: 5, backgroundColor: '#f0f0f0' }} />
        </View>
      </View>
      <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#eee' }} />
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 10 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee' }} />
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee' }} />
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee' }} />
      </View>
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <View style={{ width: '78%', height: 10, borderRadius: 5, backgroundColor: '#eee', marginBottom: 8 }} />
        <View style={{ width: '52%', height: 10, borderRadius: 5, backgroundColor: '#f0f0f0' }} />
      </View>
    </View>
  );
}

function StoryRowSkeleton(): React.ReactElement {
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', gap: 10 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={`st-${i}`} style={{ alignItems: 'center' }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#eee', marginBottom: 6 }} />
          <View style={{ width: 40, height: 8, borderRadius: 4, backgroundColor: '#f0f0f0' }} />
        </View>
      ))}
    </View>
  );
}

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check if token exists in AsyncStorage (backend JWT)
      const token = await AsyncStorage.getItem('token');
      const userId = await AsyncStorage.getItem('userId');
      
      console.log('🔐 Auth state check:', token ? 'Has token' : 'No token');

      if (token && userId) {
        console.log('✅ User logged in, navigating to home');
        router.replace('/(tabs)/home');
        // Do canonicalization in background (never block navigation).
        Promise.resolve()
          .then(() => resolveCanonicalUserId(userId))
          .catch(() => {});
      } else {
        console.log('❌ No token, navigating to welcome');
        router.replace('/auth/welcome');
      }
    } catch (error) {
      console.error('🔐 Auth check error:', error);
      router.replace('/auth/welcome');
    } finally {
      setChecking(false);
    }
  };

  if (!checking) return null;
  // Show an instant skeleton shell to avoid white flash on cold start.
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StoryRowSkeleton />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}
