import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPassportData, Stamp } from '../../../lib/firebaseHelpers/passport';
import { getUserProfile as getUserProfileAPI } from '../../../src/_services/firebaseService';
import CountryFlag from '../../../src/_components/CountryFlag';
import { LinearGradient } from 'expo-linear-gradient';
import { safeRouterBack } from '@/lib/safeRouterBack';

type PassportLocation = Stamp;

export default function UserLocationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const userId = useMemo(() => {
    const v = (params as any)?.userId;
    return Array.isArray(v) ? v[0] : v;
  }, [params]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [canView, setCanView] = useState(true);
  const [locations, setLocations] = useState<PassportLocation[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const id = await AsyncStorage.getItem('userId');
        setCurrentUserId(id);
      } catch {
        setCurrentUserId(null);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const profileRes: any = await getUserProfileAPI(String(userId), currentUserId || undefined);
      const profile = profileRes?.success ? profileRes?.data : null;

      const isPrivate = !!profile?.isPrivate;
      const approvedFollower = !!profile?.approvedFollowers?.includes(currentUserId || '');
      const isOwnProfile = !!(currentUserId && String(userId) === String(currentUserId));
      const allowed = !isPrivate || isOwnProfile || approvedFollower;
      setCanView(allowed);

      if (!allowed) {
        setLocations([]);
        return;
      }

      const passportRes: any = await getPassportData(String(userId));
      const normalized: Stamp[] = Array.isArray(passportRes?.stamps)
        ? passportRes.stamps
        : (Array.isArray(passportRes) ? passportRes : []);

      normalized.sort((a, b) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      setLocations(normalized);
    } catch {
      setCanView(true);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Locations</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A3D62" />
        </View>
      ) : !canView ? (
        <View style={styles.center}>
          <Text style={styles.privateTitle}>Private Account</Text>
          <Text style={styles.privateText}>Follow this user to see their locations.</Text>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A3D62" />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.countText}>{locations.length}</Text>
              <Text style={styles.countLabel}>Places Visited</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cityName = item.name || 'Unknown';
            const countryName = item.parentCountry || '';
            const ts = item.createdAt ? new Date(item.createdAt).getTime() : 0;
            const dateText = ts ? new Date(ts).toLocaleDateString() : '';

            return (
              <View style={styles.row}>
                <View style={styles.stampIconWrap}>
                  <LinearGradient
                    colors={['#0A3D62', '#e74c3c']}
                    style={styles.stampIconGrad}
                  >
                    <CountryFlag countryCode={item.countryCode || 'XX'} size={24} />
                    {item.count > 1 && (
                      <View style={styles.miniBadge}>
                        <Text style={styles.miniBadgeText}>{item.count}</Text>
                      </View>
                    )}
                  </LinearGradient>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.rowTitle}>{cityName}</Text>
                  <Text style={styles.rowSub}>{countryName}{dateText ? ` • ${dateText}` : ''}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No Locations Yet</Text>
              <Text style={styles.emptyText}>Add a stamp in Passport to see it here.</Text>
            </View>
          }
          contentContainerStyle={locations.length === 0 ? { flexGrow: 1 } : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  backBtn: { padding: 8, width: 40 },
  title: { fontSize: 18, fontWeight: '700', color: '#222' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  listHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  countText: { fontSize: 20, fontWeight: '800', color: '#222' },
  countLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  stampIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 10, // User requested 10 radius
    backgroundColor: '#fff',
    padding: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  stampIconGrad: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  miniBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 3,
    elevation: 2,
  },
  miniBadgeText: { fontSize: 8, fontWeight: '800', color: '#0A3D62' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  rowSub: { fontSize: 12, color: '#666', marginTop: 1 }, // 10px font size might be too small, using 12 for better readability but keeping close
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  emptyText: { fontSize: 13, color: '#777', marginTop: 6, textAlign: 'center' },
  privateTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  privateText: { fontSize: 13, color: '#777', marginTop: 6, textAlign: 'center' },
});
