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

  const normalizeLocationKey = (val?: string) => 
    String(val || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const groupedLocations = useMemo(() => {
    const countryMap = new Map<string, { title: string, countryCode: string, data: Stamp[], latest: number, hasCountryStamp: boolean, count: number }>();

    locations.forEach(stamp => {
      let cName = '';
      if (stamp.type === 'country') {
        cName = stamp.name;
      } else {
        cName = stamp.parentCountry || 'Unknown';
      }

      const normalizedKey = normalizeLocationKey(cName) || 'unknown';

      if (!countryMap.has(normalizedKey)) {
        countryMap.set(normalizedKey, {
          title: cName,
          countryCode: stamp.countryCode || 'XX',
          data: [],
          latest: 0,
          hasCountryStamp: false,
          count: 0
        });
      }

      const cData = countryMap.get(normalizedKey)!;

      if (cData.title === 'Unknown' || (stamp.type === 'country' && stamp.name)) {
        cData.title = cName;
      }

      if (stamp.countryCode && cData.countryCode === 'XX') {
        cData.countryCode = stamp.countryCode;
      }

      const ts = stamp.createdAt ? new Date(stamp.createdAt).getTime() : 0;
      if (ts > cData.latest) cData.latest = ts;

      if (stamp.type === 'country') {
        cData.hasCountryStamp = true;
        cData.count = stamp.count || cData.count;
      } else {
        cData.data.push(stamp);
      }
    });

    const result = Array.from(countryMap.values()).map(group => {
      // Sort cities by newest first
      group.data.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      return group;
    }).sort((a, b) => b.latest - a.latest);

    return result;
  }, [locations]);

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
          data={groupedLocations}
          keyExtractor={(item, index) => `${item.title}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A3D62" />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.countText}>{locations.length}</Text>
              <Text style={styles.countLabel}>Places Visited</Text>
            </View>
          }
          renderItem={({ item: group }) => {
            return (
              <View style={styles.countryGroup}>
                <View style={styles.countryHeader}>
                  <View style={styles.stampIconWrap}>
                    <LinearGradient
                      colors={['#0A3D62', '#e74c3c']}
                      style={styles.stampIconGrad}
                    >
                      <CountryFlag countryCode={group.countryCode} size={24} />
                      {group.count > 1 && (
                        <View style={styles.miniBadge}>
                          <Text style={styles.miniBadgeText}>{group.count}</Text>
                        </View>
                      )}
                    </LinearGradient>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.countryTitle}>{group.title}</Text>
                  </View>
                </View>

                {group.data.map((city, cIndex) => {
                  const ts = city.createdAt ? new Date(city.createdAt).getTime() : 0;
                  const dateText = ts ? new Date(ts).toLocaleDateString() : '';
                  const regionText = city.type === 'place' && city.parentCity ? `${city.parentCity} • ` : '';
                  
                  return (
                    <View key={`${city._id}-${cIndex}`} style={styles.cityRow}>
                      <View style={styles.cityDot} />
                      <View style={styles.cityInfo}>
                        <Text style={styles.cityTitle}>{city.name}</Text>
                        {(regionText || dateText) ? (
                          <Text style={styles.cityDate}>{regionText}{dateText}</Text>
                        ) : null}
                      </View>
                      {city.count > 1 && (
                        <View style={styles.cityBadge}>
                          <Text style={styles.cityBadgeText}>{city.count}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No Locations Yet</Text>
              <Text style={styles.emptyText}>Add a stamp in Passport to see it here.</Text>
            </View>
          }
          contentContainerStyle={groupedLocations.length === 0 ? { flexGrow: 1 } : undefined}
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
  
  countryGroup: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 8,
  },
  countryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stampIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 10,
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
  countryTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 88, // 16 (padding) + 60 (icon) + 12 (margin)
    paddingRight: 16,
    paddingVertical: 8,
  },
  cityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e74c3c',
    marginRight: 10,
  },
  cityInfo: {
    flex: 1,
  },
  cityTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  cityDate: { fontSize: 12, color: '#666', marginTop: 2 },
  cityBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  cityBadgeText: { fontSize: 10, fontWeight: '700', color: '#555' },

  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  emptyText: { fontSize: 13, color: '#777', marginTop: 6, textAlign: 'center' },
  privateTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  privateText: { fontSize: 13, color: '#777', marginTop: 6, textAlign: 'center' },
});
