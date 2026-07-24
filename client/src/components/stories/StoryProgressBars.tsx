import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

interface StoryProgressBarsProps {
  storiesCount: number;
  currentIndex: number;
  progressSv: Animated.SharedValue<number>;
}

const StoryProgressBars: React.FC<StoryProgressBarsProps> = ({ storiesCount, currentIndex, progressSv }) => {
  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressSv.value}%`
  }));

  return (
    <View style={styles.progressContainer}>
      {Array.from({ length: storiesCount }).map((_, index) => (
        <View key={index} style={styles.progressBarBg}>
          {index === currentIndex ? (
            <Animated.View style={[styles.progressBarFill, progressFillStyle]} />
          ) : (
            <View
              style={[
                styles.progressBarFill,
                { width: index < currentIndex ? '100%' : '0%' }
              ]}
            />
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 4,
    marginBottom: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
});

export default React.memo(StoryProgressBars);
