import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type Highlight = {
  id: string;
  title: string;
  coverImage: string;
  stories: { id: string; image: string; }[]; // Minimal story type
};

interface HighlightCarouselProps {
  highlights: Highlight[];
  onPressHighlight?: (highlight: Highlight) => void;
  isOwnProfile?: boolean;
  onAddHighlight?: () => void;
}

const HighlightCarousel: React.FC<HighlightCarouselProps> = ({ highlights, onPressHighlight, isOwnProfile, onAddHighlight }) => {
  const renderAddButton = () => {
    return null;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={highlights}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => item.id || `highlight-${index}`}
        ListHeaderComponent={renderAddButton}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.highlightBubble} onPress={() => onPressHighlight?.(item)}>
            <Image source={{ uri: item.coverImage }} style={styles.coverImage} />
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 0,
    backgroundColor: '#fff',
  },
  highlightBubble: {
    alignItems: 'center',
    marginRight: 12,
    width: 64,
  },
  coverImage: {
    width: 64,
    height: 64,
    borderRadius: 14,
    marginBottom: 5,
    backgroundColor: '#f5f5f5',
  },
  addButton: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    marginBottom: 5,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 11,
    color: '#000000',
    textAlign: 'center',
    maxWidth: 64,
    fontWeight: '400',
  },
});

export default HighlightCarousel;

