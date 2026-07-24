/**
 * Map marker clustering utility
 * Reduces the number of individual markers rendered on-screen
 * Groups nearby markers into clusters to reduce rendering/networking load
 */

export interface ClusteredMarker {
  id: string;
  latitude: number;
  longitude: number;
  count?: number;
  items?: any[];
}

export interface Cluster {
  center: { latitude: number; longitude: number };
  count: number;
  items: any[];
}

/**
 * Haversine distance in km between two lat/lon points
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Cluster markers based on proximity
 * @param markers - Array of markers with id, latitude, longitude
 * @param clusterRadiusKm - Radius in km to consider points in the same cluster
 * @returns Array of clustered markers (individual if alone, grouped if multiple)
 */
export function clusterMarkers(
  markers: any[],
  clusterRadiusKm: number = 0.5
): ClusteredMarker[] {
  if (!markers || markers.length === 0) return [];

  const visited = new Set<string>();
  const clusters: ClusteredMarker[] = [];

  for (const marker of markers) {
    if (visited.has(marker.id)) continue;

    const cluster: any[] = [marker];
    visited.add(marker.id);

    // Find all nearby markers
    for (const other of markers) {
      if (visited.has(other.id)) continue;

      const dist = haversineDistance(
        marker.latitude,
        marker.longitude,
        other.latitude,
        other.longitude
      );

      if (dist <= clusterRadiusKm) {
        cluster.push(other);
        visited.add(other.id);
      }
    }

    // If cluster has multiple items, create a cluster marker
    if (cluster.length > 1) {
      const avgLat = cluster.reduce((sum, m) => sum + m.latitude, 0) / cluster.length;
      const avgLon = cluster.reduce((sum, m) => sum + m.longitude, 0) / cluster.length;

      clusters.push({
        id: `cluster-${cluster.map(m => m.id).join('-')}`,
        latitude: avgLat,
        longitude: avgLon,
        count: cluster.length,
        items: cluster,
      });
    } else {
      // Single marker, keep as-is
      clusters.push({
        id: marker.id,
        latitude: marker.latitude,
        longitude: marker.longitude,
        items: [marker],
      });
    }
  }

  return clusters;
}

/**
 * Filter markers by viewport bounds + optional margin
 * Only render markers visible on-screen to reduce render load
 */
export function filterMarkersByRegion(
  markers: any[],
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  marginPercent: number = 20 // Show markers 20% outside visible bounds
): any[] {
  if (!markers || !region) return markers;

  const latMargin = (region.latitudeDelta * marginPercent) / 100;
  const lonMargin = (region.longitudeDelta * marginPercent) / 100;

  return markers.filter(
    marker =>
      marker.latitude >= region.latitude - region.latitudeDelta / 2 - latMargin &&
      marker.latitude <= region.latitude + region.latitudeDelta / 2 + latMargin &&
      marker.longitude >= region.longitude - region.longitudeDelta / 2 - lonMargin &&
      marker.longitude <= region.longitude + region.longitudeDelta / 2 + lonMargin
  );
}

/**
 * Limit the number of markers rendered (for very dense maps)
 * Prioritizes markers by some criteria (e.g., first N or random sample)
 */
export function limitMarkers(markers: any[], maxMarkers: number = 50): any[] {
  if (markers.length <= maxMarkers) return markers;
  
  // Simple approach: return first maxMarkers
  // Could be enhanced to randomly sample or prioritize based on recency/popularity
  return markers.slice(0, maxMarkers);
}
