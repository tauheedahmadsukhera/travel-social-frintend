import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { AppBrandMark } from '@/src/_components/AppBrandMark';
import fetchLogoUrl from '@/src/_services/brandingService';

export type AuthBrandHeaderProps = {
  /** Extra top spacing like `welcome.tsx` header (logo + first line). */
  variant?: 'welcome' | 'default';
  /** Bold line under the logo (e.g. screen title). */
  title?: string;
  /** Grey helper line — same typography as welcome subtitle. */
  subtitle?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
};

/**
 * Shared auth hero: remote/bundled logo + optional title + subtitle (matches `welcome.tsx`).
 */
export function AuthBrandHeader({
  variant = 'default',
  title,
  subtitle,
  children,
  style,
}: AuthBrandHeaderProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchLogoUrl()
      .then((url) => {
        if (alive) setLogoUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={[variant === 'welcome' ? styles.welcomeOuter : styles.defaultOuter, style]}>
      <View style={styles.markWrap}>
        <AppBrandMark logoUri={logoUrl} size="lg" />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  welcomeOuter: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 20,
  },
  defaultOuter: {
    alignItems: 'center',
  },
  markWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
