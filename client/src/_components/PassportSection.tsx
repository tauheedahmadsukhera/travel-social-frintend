import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import CountryFlag from './CountryFlag';
import { getPassportData, Stamp } from '../../lib/firebaseHelpers/passport';

// Conditionally import location service to avoid native module errors
let getCurrentLocation: any = null;
try {
  const locationService = require('../../services/locationService');
  getCurrentLocation = locationService.getCurrentLocation;
} catch (error) {
  console.log('Location service not available:', error);
}

const { width } = Dimensions.get('window');

interface PassportTicket {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  visitDate: number;
  imageUrl?: string;
  notes?: string;
}

interface PassportSectionProps {
  userId: string;
  isOwner?: boolean;
}

const PassportSection: React.FC<PassportSectionProps> = ({ userId, isOwner }) => {
  const router = useRouter();
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ city?: string; country?: string } | null>(null);

  useEffect(() => {
    loadPassportData();
  }, [userId]);

  const loadPassportData = async () => {
    try {
      setLoading(true);

      // Load passport data
      const result = await getPassportData(userId);
      if (result && Array.isArray(result.stamps)) {
        setStamps(result.stamps);
      }

      // Get current location if owner
      if (isOwner && getCurrentLocation) {
        try {
          const location = await getCurrentLocation();
          if (location) {
            setCurrentLocation({
              city: location.city,
              country: location.country
            });
          }
        } catch (error) {
          console.log('Error getting current location:', error);
          setCurrentLocation(null);
        }
      }
    } catch (error) {
      console.error('âŒ Error loading passport data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFlagEmoji = (countryCode: string): string => {
    if (!countryCode || countryCode.length !== 2) return 'ðŸŒ';
    const codePoints = countryCode.toUpperCase().split('').map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8D00" />
        <Text style={styles.loadingText}>Loading your passport...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Current Location Card */}
      {isOwner && currentLocation && (
        <View style={styles.currentLocationCard}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.locationGradient}
          >
            <Feather name="map-pin" size={24} color="#fff" />
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Current Location</Text>
              <Text style={styles.locationText}>
                {currentLocation.city}, {currentLocation.country}
              </Text>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stamps.length}</Text>
          <Text style={styles.statLabel}>Stamps</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stamps.filter(s => s.type === 'country').length}</Text>
          <Text style={styles.statLabel}>Countries</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stamps.filter(s => s.type === 'city').length}</Text>
          <Text style={styles.statLabel}>Cities</Text>
        </View>
      </View>

      {/* Passport Stamps Grid */}
      <View style={styles.stampsHeader}>
        <Text style={styles.stampsTitle}>Travel Stamps</Text>
        <Feather name="award" size={20} color="#FF8D00" />
      </View>

      {stamps.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="globe" size={64} color="#ddd" />
          <Text style={styles.emptyTitle}>No Stamps Yet</Text>
          <Text style={styles.emptyText}>
            Start traveling to collect passport stamps!
          </Text>
        </View>
      ) : (
        <View style={styles.stampsGrid}>
          {stamps.map((stamp) => (
            <TouchableOpacity
              key={stamp._id}
              style={styles.stampOuter}
              onPress={() => router.push(`/passport?user=${userId}`)}
            >
              <View style={styles.stampCircle}>
                <LinearGradient
                  colors={['#FF8D00', '#e74c3c']}
                  style={styles.stampGrad}
                >
                  <CountryFlag countryCode={stamp.countryCode || 'XX'} size={30} />
                  {stamp.count > 1 && (
                    <View style={styles.counterBadge}>
                      <Text style={styles.counterText}>{stamp.count}</Text>
                    </View>
                  )}
                </LinearGradient>
              </View>
              <Text style={styles.stampName} numberOfLines={1}>{stamp.name}</Text>
              <Text style={styles.stampType}>{stamp.type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView >
  );
};

export default PassportSection;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  currentLocationCard: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  locationGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  locationInfo: {
    marginLeft: 16,
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF8D00',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#eee',
    marginHorizontal: 16,
  },
  stampsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stampsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#999',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
  },
  stampsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  stampOuter: {
    width: (width - 60) / 3,
    marginBottom: 15,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  stampCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 4,
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  stampGrad: {
    flex: 1,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  counterBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  counterText: { fontSize: 9, fontWeight: '800', color: '#FF8D00' },
  stampName: { fontSize: 13, fontWeight: '700', color: '#111', marginTop: 6, textAlign: 'center' },
  stampType: { fontSize: 10, color: '#888', marginTop: 1, textTransform: 'capitalize' },
});



