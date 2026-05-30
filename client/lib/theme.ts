/**
 * Dark Mode & Theme System
 * Supports light and dark themes with system preferences
 */

import AsyncStorage from '@/lib/storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  info: string;
}

// Light theme colors
export const LIGHT_COLORS: ThemeColors = {
  primary: '#667eea',
  secondary: '#764ba2',
  accent: '#e0245e',
  background: '#ffffff',
  surface: '#f5f5f5',
  text: '#111111',
  textSecondary: '#666666',
  border: '#e0e0e0',
  error: '#ff4757',
  success: '#31a24c',
  warning: '#FF8D00',
  info: '#3498db',
};

// Dark theme colors
export const DARK_COLORS: ThemeColors = {
  primary: '#667eea',
  secondary: '#764ba2',
  accent: '#ff5a7e',
  background: '#121212',
  surface: '#1e1e1e',
  text: '#ffffff',
  textSecondary: '#b0b0b0',
  border: '#333333',
  error: '#ff5c7c',
  success: '#4caf50',
  warning: '#ff9800',
  info: '#64b5f6',
};

export interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: Theme) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Theme Provider Component
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('system');
  const [loading, setLoading] = useState(true);

  // Load theme preference on app start
  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('app-theme');
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')) {
        setThemeState(savedTheme as Theme);
      }
    } catch (error) {
      console.error('Load theme error:', error);
    } finally {
      setLoading(false);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem('app-theme', newTheme);
      console.log('✅ Theme changed to:', newTheme);
    } catch (error) {
      console.error('Set theme error:', error);
    }
  };

  const toggleTheme = async () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    await setTheme(newTheme);
  };

  // Determine if dark mode is active
  let isDark = false;
  if (theme === 'system') {
    isDark = systemColorScheme === 'dark';
  } else if (theme === 'dark') {
    isDark = true;
  }

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  if (loading) {
    return null;
  }

  const value: ThemeContextType = {
    theme,
    isDark,
    colors,
    setTheme,
    toggleTheme,
  };

  return React.createElement(
    ThemeContext.Provider,
    { value },
    children
  );
}

/**
 * Hook to use theme in components
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

/**
 * Hook to get only colors
 */
export function useThemeColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}

/**
 * Hook to check if dark mode is active
 */
export function useIsDarkMode(): boolean {
  const { isDark } = useTheme();
  return isDark;
}

/**
 * Hook to create themed styles
 */
export function createThemedStyles(lightStyles: any, darkStyles: any) {
  return (isDark: boolean) => {
    return isDark ? darkStyles : lightStyles;
  };
}

/**
 * Create themed View styles
 */
export const createThemedViewStyles = (isDark: boolean) => {
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    surface: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
    },
    text: {
      color: colors.text,
    },
    textSecondary: {
      color: colors.textSecondary,
    },
  });
};

/**
 * Palette for common UI elements
 */
export const useThemedPalette = () => {
  const colors = useThemeColors();
  return {
    button: {
      primary: {
        backgroundColor: colors.primary,
        color: '#fff',
      },
      secondary: {
        backgroundColor: colors.secondary,
        color: '#fff',
      },
      accent: {
        backgroundColor: colors.accent,
        color: '#fff',
      },
    },
    input: {
      backgroundColor: colors.surface,
      color: colors.text,
      borderColor: colors.border,
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    error: {
      backgroundColor: colors.error + '20',
      borderColor: colors.error,
      color: colors.error,
    },
    success: {
      backgroundColor: colors.success + '20',
      borderColor: colors.success,
      color: colors.success,
    },
    warning: {
      backgroundColor: colors.warning + '20',
      borderColor: colors.warning,
      color: colors.warning,
    },
    divider: {
      borderColor: colors.border,
    },
  };
};

