import { Dimensions, Platform, StatusBar } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const { height: SCREEN_HEIGHT } = Dimensions.get('screen');

/**
 * Get safe screen dimensions accounting for notches, status bar, etc.
 */
export function getScreenDimensions() {
  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;
  
  return {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    statusBarHeight,
    isSmallDevice: SCREEN_WIDTH < 375,
    isMediumDevice: SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414,
    isLargeDevice: SCREEN_WIDTH >= 414,
    isShortDevice: SCREEN_HEIGHT < 700,
    isTallDevice: SCREEN_HEIGHT >= 900,
  };
}

/**
 * Scale size based on screen width (base: 375 - iPhone SE/8)
 */
export function scaleSize(size: number): number {
  const baseWidth = 375;
  return (SCREEN_WIDTH / baseWidth) * size;
}

/**
 * Scale font size with min/max limits
 */
export function scaleFontSize(size: number, minSize?: number, maxSize?: number): number {
  const scaled = scaleSize(size);
  if (minSize && scaled < minSize) return minSize;
  if (maxSize && scaled > maxSize) return maxSize;
  return scaled;
}

/**
 * Get responsive modal height (percentage of screen)
 */
export function getModalHeight(percentage: number = 0.9): number {
  return SCREEN_HEIGHT * percentage;
}

/**
 * Get responsive padding based on screen size
 */
export function getResponsivePadding() {
  const { isSmallDevice, isMediumDevice } = getScreenDimensions();
  
  if (isSmallDevice) {
    return {
      horizontal: 12,
      vertical: 12,
      section: 16,
    };
  }
  
  if (isMediumDevice) {
    return {
      horizontal: 16,
      vertical: 16,
      section: 20,
    };
  }
  
  return {
    horizontal: 20,
    vertical: 20,
    section: 24,
  };
}

/**
 * Get safe area insets for modals
 */
export function getSafeAreaInsets() {
  const { statusBarHeight } = getScreenDimensions();
  
  return {
    top: Platform.OS === 'ios' ? 44 : statusBarHeight,
    bottom: Platform.OS === 'ios' ? 34 : 0,
    left: 0,
    right: 0,
  };
}

/**
 * Get keyboard avoiding view offset
 */
export function getKeyboardOffset() {
  const { isShortDevice } = getScreenDimensions();
  
  if (Platform.OS === 'ios') {
    return isShortDevice ? 60 : 90;
  }
  
  return 0;
}

/**
 * Get responsive modal styles
 */
export function getResponsiveModalStyles() {
  const { height, isShortDevice } = getScreenDimensions();
  const insets = getSafeAreaInsets();
  
  return {
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: '#fff',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: isShortDevice ? height * 0.85 : height * 0.9,
      paddingTop: 20,
      paddingBottom: insets.bottom + 20,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: '#ddd',
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 12,
    },
  };
}

/**
 * Get responsive input styles
 */
export function getResponsiveInputStyles() {
  const { isSmallDevice } = getScreenDimensions();
  
  return {
    height: isSmallDevice ? 44 : 48,
    fontSize: isSmallDevice ? 14 : 15,
    paddingHorizontal: isSmallDevice ? 12 : 16,
  };
}

/**
 * Get responsive button styles
 */
export function getResponsiveButtonStyles() {
  const { isSmallDevice } = getScreenDimensions();
  
  return {
    height: isSmallDevice ? 44 : 50,
    fontSize: isSmallDevice ? 15 : 16,
    paddingHorizontal: isSmallDevice ? 16 : 20,
  };
}

export default {
  getScreenDimensions,
  scaleSize,
  scaleFontSize,
  getModalHeight,
  getResponsivePadding,
  getSafeAreaInsets,
  getKeyboardOffset,
  getResponsiveModalStyles,
  getResponsiveInputStyles,
  getResponsiveButtonStyles,
};

