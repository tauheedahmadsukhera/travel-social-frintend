import React from 'react';
import { ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

/** From `logo-trips.svg` — good next to wordmark. */
const LOGO_TRIPS_MARK = require('../../assets/images/logo-trips-mark.png') as ImageSourcePropType;
/** From `logo-trips-app.svg` — clearer in the tab bar at small sizes. */
const LOGO_APP_RASTER = require('../../assets/images/icon.png') as ImageSourcePropType;

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, { text: number; icon: number }> = {
  sm: { text: 22, icon: 34 },
  md: { text: 28, icon: 44 },
  lg: { text: 36, icon: 52 },
};

/** Top tab bar: icon + wordmark sized as a pair (icon cap-height ≈ text line). */
const TAB_BAR = {
  icon: 32,
  text: 19,
  textMarginLeft: 0,
  letter: -0.45,
  weight: '800' as const,
};

const DEFAULT_TEXT_TIGHTEN = 0;

type Props = {
  /** Optional remote logo from `/branding`; otherwise bundled Trips mark is used. */
  logoUri?: string | null;
  size?: Size;
  /** Show mark next to the word. */
  showIcon?: boolean;
  /** When false, only the logo mark is shown (e.g. top tab bar). Default true. */
  showWordmark?: boolean;
  /** Override mark width/height in px (e.g. 40 for tab header). */
  iconSize?: number;
  /**
   * `app` = launcher-style raster (icon.png). `mark` = wordmark companion PNG.
   * Tab header uses `app` for a crisp mark beside the title.
   */
  iconAsset?: 'mark' | 'app';
  /** Use with `showWordmark` for home header: balanced icon + “Trips” text. */
  variant?: 'default' | 'tabBar';
};

/**
 * Trips logo mark + optional wordmark (PNG from `npm run assets:trips-png`).
 */
export function AppBrandMark({
  logoUri,
  size = 'md',
  showIcon = true,
  showWordmark = true,
  iconSize,
  iconAsset = 'mark',
  variant = 'default',
}: Props) {
  const s = SIZES[size];
  const trimmed = logoUri?.trim();
  const bundled = iconAsset === 'app' ? LOGO_APP_RASTER : LOGO_TRIPS_MARK;
  const iconSource: ImageSourcePropType =
    trimmed && trimmed.length > 0 ? { uri: trimmed } : bundled;

  const isTabBar = variant === 'tabBar';
  const iconPx = iconSize ?? (isTabBar ? TAB_BAR.icon : showWordmark ? s.icon : Math.max(40, s.icon));
  const textSize = isTabBar ? TAB_BAR.text : s.text;
  const titleWeight = isTabBar ? TAB_BAR.weight : '900';
  const pullText =
    showIcon && showWordmark
      ? { marginLeft: isTabBar ? TAB_BAR.textMarginLeft : DEFAULT_TEXT_TIGHTEN }
      : null;

  return (
    <View
      style={[
        styles.row,
        !showIcon && styles.rowTextOnly,
        !showWordmark && styles.rowIconOnly,
      ]}
    >
      {showIcon ? (
        <ExpoImage
          source={iconSource}
          style={{ width: iconPx, height: iconPx }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      ) : null}
      {showWordmark ? (
        <Text
          style={[
            styles.word,
            { fontSize: textSize, fontWeight: titleWeight },
            pullText,
            isTabBar ? { letterSpacing: TAB_BAR.letter } : null,
          ]}
        >
          Trips
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  rowTextOnly: {
    gap: 0,
  },
  rowIconOnly: {
    gap: 0,
  },
  word: {
    fontWeight: '900',
    color: '#000000',
    letterSpacing: -0.65,
  },
});
