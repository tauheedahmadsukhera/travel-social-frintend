import { useState, useEffect, useRef, useCallback } from 'react';
import { useSharedValue } from 'react-native-reanimated';

interface Story {
  id: string;
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  imageUrl?: string;
}

export function useStories(
  stories: Story[],
  initialIndex: number,
  onClose: () => void,
  extraPauseCondition: boolean = false
) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [videoDuration, setVideoDuration] = useState(5000);
  const progressSv = useSharedValue(0);
  
  const currentIndexRef = useRef(initialIndex);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const storiesRef = useRef(stories);
  useEffect(() => { storiesRef.current = stories; }, [stories]);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const goToNext = useCallback(() => {
    const currIndex = currentIndexRef.current;
    const currentStories = storiesRef.current || [];
    console.log('[useStories] ⏭️ goToNext called. currentIndex:', currIndex, 'stories.length:', currentStories.length, 'Stack trace:\n', new Error().stack);
    if (currIndex < currentStories.length - 1) {
      console.log('[useStories] ⏭️ Incrementing index to:', currIndex + 1);
      setCurrentIndex(prev => prev + 1);
      setImageLoading(true);
      setVideoDuration(5000);
      progressSv.value = 0;
    } else {
      console.log('[useStories] 🏁 Calling onClose() from goToNext. End of stories reached.');
      onCloseRef.current();
    }
  }, [progressSv]);

  const goToPrevious = useCallback(() => {
    const currIndex = currentIndexRef.current;
    console.log('[useStories] ⏮️ goToPrevious called. currentIndex:', currIndex);
    if (currIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setImageLoading(true);
      setVideoDuration(5000);
      progressSv.value = 0;
    }
  }, [progressSv]);

  // Clean stable JS-based timer for autoplay progress
  useEffect(() => {
    const isActuallyPaused = isPaused || imageLoading || extraPauseCondition;
    console.log('[useStories] JS Timer Effect. currentIndex:', currentIndex, 'isActuallyPaused:', isActuallyPaused);
    
    if (isActuallyPaused) {
      return;
    }

    const duration = stories[currentIndex]?.mediaType === 'video' ? videoDuration : 5000;
    const intervalTime = 30; // Update progress every 30ms for butter-smooth animation (60fps-like)
    let elapsed = 0;
    progressSv.value = 0;

    const timer = setInterval(() => {
      elapsed += intervalTime;
      const progressPercent = Math.min(100, (elapsed / duration) * 100);
      progressSv.value = progressPercent;

      if (elapsed >= duration) {
        clearInterval(timer);
        goToNext();
      }
    }, intervalTime);

    return () => {
      console.log('[useStories] JS Timer Cleanup for currentIndex:', currentIndex);
      clearInterval(timer);
    };
  }, [currentIndex, isPaused, imageLoading, videoDuration, stories, goToNext, progressSv, extraPauseCondition]);

  return {
    currentIndex,
    setCurrentIndex,
    isPaused,
    setIsPaused,
    imageLoading,
    setImageLoading,
    videoDuration,
    setVideoDuration,
    progressSv,
    goToNext,
    goToPrevious
  };
}

