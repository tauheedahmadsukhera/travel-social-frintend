import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPassportData, Stamp } from '../../../lib/firebaseHelpers/passport';
import { getUserProfile as getUserProfileAPI } from '../../../src/services/firebaseService';
import CountryFlag from '../../../src/components/CountryFlag';
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
    const countryMap = new Map<string, { title: string, countryCode: string, data: Stamp[], latest: number, firstAdded: number, hasCountryStamp: boolean, count: number }>();

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
          firstAdded: 0,
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
      if (ts > 0) {
        if (ts > cData.latest) cData.latest = ts;
        if (cData.firstAdded === 0 || ts < cData.firstAdded) {
          cData.firstAdded = ts;
        }
      }

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
          <ActivityIndicator size="large" color="#FF8D00" />
        </View>
      ) : !canView ? (
        <View style={styles.center}>
          <Feather name="lock" size={48} color="#FF8D00" style={{ marginBottom: 12 }} />
          <Text style={styles.privateTitle}>Private Account</Text>
          <Text style={styles.privateText}>Follow this user to see their locations.</Text>
        </View>
      ) : (
        <FlatList
          data={groupedLocations}
          keyExtractor={(item, index) => `${item.title}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8D00" />}
          ListHeaderComponent={
            <View style={styles.premiumCardContainer}>
              <LinearGradient
                colors={['#FF8D00', '#FF4500']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.premiumCard}
              >
                <View style={styles.premiumCardHeader}>
                  <Feather name="globe" size={20} color="#fff" style={{ opacity: 0.9, marginRight: 8 }} />
                  <Text style={styles.premiumCardLabel}>TRAVEL JOURNEY</Text>
                </View>
                
                <View style={styles.premiumStatsRow}>
                  <View style={styles.premiumStatItem}>
                    <Text style={styles.premiumStatValue}>{groupedLocations.length}</Text>
                    <Text style={styles.premiumStatLabel}>Countries</Text>
                  </View>
                  
                  <View style={styles.premiumStatDivider} />
                  
                  <View style={styles.premiumStatItem}>
                    <Text style={styles.premiumStatValue}>{locations.length}</Text>
                    <Text style={styles.premiumStatLabel}>Places Visited</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          }
          renderItem={({ item: group }) => {
            return (
              <View style={styles.countryGroup}>
                <View style={styles.countryHeader}>
                  <View style={styles.stampIconWrap}>
                    <View style={styles.stampIconGrad}>
                      <CountryFlag countryCode={group.countryCode} size={22} />
                    </View>
                    {group.count > 1 && (
                      <View style={styles.miniBadge}>
                        <Text style={styles.miniBadgeText}>{group.count}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.countryTitle}>{group.title}</Text>
                    {group.firstAdded > 0 && (
                      <Text style={styles.countryDate}>
                        Visited on {new Date(group.firstAdded).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </View>

                {group.data.map((city, cIndex) => {
                  const ts = city.createdAt ? new Date(city.createdAt).getTime() : 0;
                  const dateText = ts ? new Date(ts).toLocaleDateString() : '';
                  const regionText = city.type === 'place' && city.parentCity ? `${city.parentCity} • ` : '';
                  
                  return (
                    <View key={`${city._id}-${cIndex}`} style={styles.cityRow}>
                      <Feather name="map-pin" size={14} color="#FF8D00" style={{ marginRight: 10 }} />
                      <View style={styles.cityInfo}>
                        <Text style={styles.cityTitle}>{city.name}</Text>
                        {(regionText || dateText) ? (
                          <Text style={styles.cityDate}>{regionText}{dateText}</Text>
                        ) : null}
                      </View>
                      {city.count > 1 && (
                        <View style={styles.cityBadge}>
                          <Text style={styles.cityBadgeText}>{city.count} visits</Text>
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
              <Feather name="map" size={48} color="#FF8D00" style={{ marginBottom: 12, opacity: 0.5 }} />
              <Text style={styles.emptyTitle}>No Locations Yet</Text>
              <Text style={styles.emptyText}>Add a stamp in Passport to see it here.</Text>
            </View>
          }
          contentContainerStyle={groupedLocations.length === 0 ? { flexGrow: 1 } : { paddingBottom: 32 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 60 },
  
  premiumCardContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  premiumCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#FF8D00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  premiumCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumCardLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.2,
  },
  premiumStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  premiumStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  premiumStatValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  premiumStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  premiumStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  
  countryGroup: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  countryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 8,
  },
  stampIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffe6cc',
    position: 'relative',
  },
  stampIconGrad: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 141, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF8D00',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  miniBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
  countryTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  countryDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 4,
  },
  cityInfo: {
    flex: 1,
  },
  cityTitle: { fontSize: 14, fontWeight: '600', color: '#374151' },
  cityDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  cityBadge: {
    backgroundColor: '#fff4eb',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  cityBadgeText: { fontSize: 10, fontWeight: '700', color: '#FF8D00' },

  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginTop: 12 },
  emptyText: { fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center' },
  privateTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginTop: 12 },
  privateText: { fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center' },
});
