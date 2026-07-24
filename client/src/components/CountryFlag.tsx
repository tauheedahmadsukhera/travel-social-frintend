import { Image as ExpoImage } from 'expo-image';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// ── CDN: flagcdn.com serves flags for ANY ISO 3166-1 alpha-2 country code ────
// e.g. PK → https://flagcdn.com/w160/pk.png
// Free, no API key required, 250+ countries supported
function getFlagUrl(countryCode: string): string {
    return `https://flagcdn.com/w160/${countryCode.toLowerCase()}.png`;
}

// ── Deterministic color palette for offline/unknown fallback ──────────────────
const PALETTE: [string, string][] = [
    ['#C0392B', '#E74C3C'],
    ['#1A5276', '#2E86C1'],
    ['#1E8449', '#27AE60'],
    ['#6C3483', '#8E44AD'],
    ['#7E5109', '#D4AC0D'],
    ['#1A4D2E', '#28B463'],
    ['#922B21', '#E74C3C'],
    ['#154360', '#2471A3'],
];

function getPaletteForCode(code: string): [string, string] {
    let hash = 0;
    for (let i = 0; i < code.length; i++) hash = code.charCodeAt(i) + ((hash << 5) - hash);
    const pair = PALETTE[Math.abs(hash) % PALETTE.length];
    return [pair[0], pair[1]];
}

// ── Default fallback flag (when CDN fails or no internet) ─────────────────────
function DefaultFlag({ countryCode, size }: { countryCode: string; size: number }) {
    const code = (countryCode || '??').toUpperCase().slice(0, 2);
    const [top, bottom] = getPaletteForCode(code);
    const fontSize = size * 0.3;
    return (
        <View style={[s.defaultWrap, { width: size, height: size }]}>
            <View style={[s.half, { backgroundColor: top }]} />
            <View style={[s.half, { backgroundColor: bottom }]} />
            <View style={s.overlay}>
                <Text style={[s.initials, { fontSize }]}>{code}</Text>
            </View>
        </View>
    );
}

// ── Main CountryFlag component ────────────────────────────────────────────────
interface CountryFlagProps {
    countryCode: string;   // ISO 3166-1 alpha-2, e.g. "PK", "GB", "US"
    size?: number;
    style?: object;
}

export default function CountryFlag({ countryCode, size = 40, style }: CountryFlagProps) {
    const [failed, setFailed] = useState(false);
    const code = (countryCode || '').trim().toUpperCase();

    if (!code || code.length !== 2 || failed) {
        return (
            <View style={[{ borderRadius: size * 0.12, overflow: 'hidden' }, style]}>
                <DefaultFlag countryCode={code || '??'} size={size} />
            </View>
        );
    }

    return (
        <ExpoImage
            source={{ uri: getFlagUrl(code) }}
            style={[{ width: size, height: size, borderRadius: size * 0.12 }, style]}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
        />
    );
}

const s = StyleSheet.create({
    defaultWrap: {
        overflow: 'hidden',
        flexDirection: 'column',
    },
    half: { flex: 1 },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    initials: {
        color: '#fff',
        fontWeight: '900',
        letterSpacing: 1,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
});
