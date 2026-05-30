import React from 'react';
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { hapticLight } from '@/lib/haptics';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

interface ProfileSectionsProps {
  sections: any[];
  selectedSection: string | null;
  onSelectSection: (sectionName: string | null) => void;
  sectionSourcePosts: any[];
  getPostId: (post: any) => string;
  isOwnProfile: boolean;
  currentUserId: string | null;
}

const ProfileSections: React.FC<ProfileSectionsProps> = ({
  sections,
  selectedSection,
  onSelectSection,
  sectionSourcePosts,
  getPostId,
  isOwnProfile,
  currentUserId,
}) => {
  const visibleSections = (sections as any[]).filter(s => {
    if (isOwnProfile) return true;
    if (!s.visibility || s.visibility === 'public') return true;
    const collaborators = Array.isArray(s.collaborators) ? s.collaborators : [];
    const viewerId = String(currentUserId || '');
    return collaborators.some((c: any) => {
      const cid = typeof c === 'string' ? c : (c.userId || c.uid || c._id || c.firebaseUid);
      return String(cid) === viewerId;
    });
  });

  if (visibleSections.length === 0) return null;

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      contentContainerStyle={styles.container}
    >
      {visibleSections.map((s, idx) => {
        const isActive = selectedSection === s.name;
        const firstPostInRange = sectionSourcePosts.find(p => s.postIds?.includes?.(getPostId(p)));
        const coverUri = s.coverImage || firstPostInRange?.imageUrl || DEFAULT_AVATAR_URL;
        
        return (
          <TouchableOpacity
            key={`section-${String((s as any)?._id || s.name)}-${idx}`}
            activeOpacity={0.8}
            onPress={() => { 
              hapticLight(); 
              onSelectSection(isActive ? null : s.name); 
            }}
            style={styles.sectionItem}
          >
            <View style={[
              styles.imageContainer,
              isActive && styles.activeImageContainer
            ]}>
              <ExpoImage 
                source={{ uri: coverUri }} 
                style={styles.image} 
                contentFit="cover" 
                transition={0} 
              />
            </View>
            <Text 
              numberOfLines={1} 
              style={[
                styles.label,
                isActive && styles.activeLabel
              ]}
            >
              {s.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    gap: 14,
    paddingVertical: 0,
    marginBottom: 8,
  },
  sectionItem: {
    alignItems: 'center',
    width: 60,
  },
  imageContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#eee',
    borderWidth: 0,
  },
  activeImageContainer: {
    borderWidth: 2,
    borderColor: '#0A3D62',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  label: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '400',
    color: '#333',
    textAlign: 'center',
    width: 60,
  },
  activeLabel: {
    fontWeight: '700',
    color: '#0A3D62',
  },
});

export default React.memo(ProfileSections);
