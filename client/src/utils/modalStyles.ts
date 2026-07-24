/**
 * Common responsive modal styles
 * Use these styles across all modals for consistent responsive design
 */

import { Dimensions, Platform, StyleSheet } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Device detection
export const isSmallDevice = SCREEN_WIDTH < 375;
export const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;
export const isLargeDevice = SCREEN_WIDTH >= 414;
export const isShortDevice = SCREEN_HEIGHT < 700;
export const isTablet = SCREEN_WIDTH >= 768;

// Responsive values
export const responsiveModal = {
  // Padding
  padding: isSmallDevice ? 12 : 16,
  paddingLarge: isSmallDevice ? 16 : 24,
  
  // Font sizes
  titleSize: isSmallDevice ? 18 : 20,
  subtitleSize: isSmallDevice ? 14 : 16,
  textSize: isSmallDevice ? 13 : 14,
  smallTextSize: isSmallDevice ? 11 : 12,
  
  // Button heights
  buttonHeight: isSmallDevice ? 44 : 50,
  smallButtonHeight: isSmallDevice ? 36 : 40,
  
  // Input heights
  inputHeight: isSmallDevice ? 44 : 48,
  textareaHeight: isSmallDevice ? 80 : 100,
  
  // Border radius
  borderRadius: isSmallDevice ? 12 : 16,
  smallRadius: isSmallDevice ? 8 : 10,
  
  // Icon sizes
  iconSize: isSmallDevice ? 20 : 24,
  smallIconSize: isSmallDevice ? 16 : 18,
  
  // Avatar sizes
  avatarSmall: isSmallDevice ? 32 : 40,
  avatarMedium: isSmallDevice ? 48 : 56,
  avatarLarge: isSmallDevice ? 70 : 80,
  
  // Modal heights
  maxHeight: isShortDevice ? SCREEN_HEIGHT * 0.85 : SCREEN_HEIGHT * 0.9,
  halfHeight: SCREEN_HEIGHT * 0.5,
  
  // Hit slop for touch targets
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
};

// Common modal styles
export const modalStyles = StyleSheet.create({
  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  
  // Container
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: responsiveModal.borderRadius,
    borderTopRightRadius: responsiveModal.borderRadius,
    maxHeight: responsiveModal.maxHeight,
    paddingTop: responsiveModal.padding,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  centerContainer: {
    backgroundColor: '#fff',
    borderRadius: responsiveModal.borderRadius,
    width: isTablet ? 500 : SCREEN_WIDTH - 40,
    maxWidth: 500,
    padding: responsiveModal.paddingLarge,
  },
  fullContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  
  // Handle
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: responsiveModal.padding,
    paddingBottom: responsiveModal.padding,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: responsiveModal.titleSize,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  headerSubtitle: {
    fontSize: responsiveModal.subtitleSize,
    fontWeight: '500',
    color: '#000',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Content
  content: {
    paddingHorizontal: responsiveModal.padding,
    paddingTop: responsiveModal.padding,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: responsiveModal.padding,
    paddingTop: responsiveModal.padding,
    paddingBottom: 20,
  },
  
  // Text
  title: {
    fontSize: responsiveModal.titleSize,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: responsiveModal.subtitleSize,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  text: {
    fontSize: responsiveModal.textSize,
    color: '#666',
    lineHeight: responsiveModal.textSize * 1.5,
  },
  smallText: {
    fontSize: responsiveModal.smallTextSize,
    color: '#999',
  },
  
  // Inputs
  input: {
    height: responsiveModal.inputHeight,
    backgroundColor: '#f5f5f5',
    borderRadius: responsiveModal.smallRadius,
    paddingHorizontal: responsiveModal.padding,
    fontSize: responsiveModal.textSize,
    color: '#000',
  },
  textarea: {
    height: responsiveModal.textareaHeight,
    backgroundColor: '#f5f5f5',
    borderRadius: responsiveModal.smallRadius,
    paddingHorizontal: responsiveModal.padding,
    paddingTop: 12,
    fontSize: responsiveModal.textSize,
    color: '#000',
    textAlignVertical: 'top',
  },
  
  // Buttons
  button: {
    height: responsiveModal.buttonHeight,
    backgroundColor: '#0A3D62',
    borderRadius: responsiveModal.smallRadius,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: responsiveModal.padding,
  },
  buttonText: {
    fontSize: responsiveModal.subtitleSize,
    fontWeight: '600',
    color: '#fff',
  },
  outlineButton: {
    height: responsiveModal.buttonHeight,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: responsiveModal.smallRadius,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: responsiveModal.padding,
  },
  outlineButtonText: {
    fontSize: responsiveModal.subtitleSize,
    fontWeight: '600',
    color: '#333',
  },
  dangerButton: {
    height: responsiveModal.buttonHeight,
    backgroundColor: '#FF3B30',
    borderRadius: responsiveModal.smallRadius,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: responsiveModal.padding,
  },
  
  // Row items
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowAvatar: {
    width: responsiveModal.avatarSmall,
    height: responsiveModal.avatarSmall,
    borderRadius: responsiveModal.avatarSmall / 2,
    marginRight: 12,
  },
  rowText: {
    flex: 1,
    fontSize: responsiveModal.textSize,
    color: '#000',
  },
  
  // Divider
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: responsiveModal.padding,
  },
  
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: responsiveModal.subtitleSize,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
});

// Alert dialog styles
export const alertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 14,
    width: isTablet ? 340 : Math.min(SCREEN_WIDTH - 80, 300),
    maxWidth: 340,
    overflow: 'hidden',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: isSmallDevice ? 16 : 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: isSmallDevice ? 13 : 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  buttonLast: {
    borderRightWidth: 0,
  },
  buttonText: {
    fontSize: isSmallDevice ? 15 : 16,
    color: '#007AFF',
    fontWeight: '400',
  },
  buttonTextBold: {
    fontWeight: '600',
  },
  buttonTextDestructive: {
    color: '#FF3B30',
  },
});

export default {
  responsiveModal,
  modalStyles,
  alertStyles,
  isSmallDevice,
  isMediumDevice,
  isLargeDevice,
  isShortDevice,
  isTablet,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
};
