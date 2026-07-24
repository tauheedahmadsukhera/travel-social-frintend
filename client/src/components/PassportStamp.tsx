import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  Path,
  Rect,
  Text as SvgText,
  TextPath,
  SvgUri,
} from 'react-native-svg';
import { BACKEND_URL } from '../../lib/api';
import { formatDisplayDate } from '../../lib/utils/date';

const { width } = Dimensions.get('window');

interface Stamp {
  _id?: string;
  id?: string;
  name: string;
  type: 'country' | 'city' | 'place';
  createdAt: any;
  count: number;
  countryCode?: string;
  parentCountry?: string;
  parentCity?: string;
}

const formatDateLocal = (date: Date | string): string => {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Date';
    const day = d.getDate().toString().padStart(2, '0');
    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${monthShort} ${year}`;
  } catch (e) {
    return 'Date';
  }
};

export const PassportStamp = React.memo(({ stamp, size = 140, type = 'circular' }: { stamp: Stamp, size?: number, type?: 'circular' | 'oval' }) => {
  const [useExternal, setUseExternal] = useState(stamp.type === 'country');
  const colorMap: Record<string, string> = {
    country: '#0E9F6E',
    city: '#1E63D7',
    place: '#7A3DB8',
  };
  const color = colorMap[stamp.type] || '#D64545';
  const stampUri = `${BACKEND_URL}/stamps/${encodeURIComponent(stamp.name)}.svg`;
  const created = new Date(stamp.createdAt);
  const dateText = Number.isNaN(created.getTime())
    ? 'UNVERIFIED DATE'
    : formatDateLocal(created).toUpperCase();
  const safeId = 'id_' + String(stamp._id || stamp.id || stamp.name || 'stamp').replace(/[^A-Za-z0-9_-]/g, '_');
  const title = (stamp.name || 'STAMP').toUpperCase();
  const subTitle = stamp.type === 'country' ? 'IMMIGRATION' : (stamp.type === 'city' ? 'CITY ENTRY' : 'PLACE CHECK-IN');
  const hash = Array.from(safeId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const tilt = (hash % 7) - 3;
  const grainOpacity = 0.06 + ((hash % 5) * 0.01);
  const ringDash = `${6 + (hash % 3)} ${3 + (hash % 2)}`;

  // Dynamic font sizing to prevent overlap for long names
  const ovalTitle = title.length > 24 ? `${title.slice(0, 22)}...` : title;
  const ovalFontSize = title.length > 14 ? Math.max(10, Math.floor(220 / ovalTitle.length)) : 17;
  const ovalY = 90 + (ovalFontSize * 0.35);
  
  const circleTitle = title.length > 16 ? `${title.slice(0, 14)}...` : title;
  const circleFontSize = title.length > 8 ? Math.max(7, Math.floor(95 / circleTitle.length)) : 13;
  const circleY = 80 + (circleFontSize * 0.35);

  if (useExternal && stamp.type === 'country') {
    return (
      <View style={[styles.stampCircle, { width: size, height: size, backgroundColor: 'transparent' }]}>
        {stampUri && useExternal ? (
          <SvgUri
            uri={stampUri}
            width={size}
            height={size}
            onError={() => setUseExternal(false)}
          />
        ) : null}
        {stamp.count > 1 && (
          <View style={[styles.counterBadge, { backgroundColor: color }]}>
            <Text style={styles.counterText}>x{stamp.count}</Text>
          </View>
        )}
      </View>
    );
  }

  if (type === 'oval') {
    return (
      <View style={[styles.stampOval, { width: width * 0.83, height: width * 0.47, backgroundColor: 'transparent', transform: [{ rotate: `${tilt * 0.35}deg` }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 320 180">
          <Defs>
            <Path id={`topArc_${safeId}`} d="M 30 98 A 130 70 0 0 1 290 98" fill="none" />
            <Path id={`bottomArc_${safeId}`} d="M 290 108 A 130 70 0 0 1 30 108" fill="none" />
          </Defs>

          <Ellipse cx="160" cy="90" rx="150" ry="82" fill={color} fillOpacity={0.03} stroke={color} strokeWidth="3" strokeDasharray={ringDash} />
          <Ellipse cx="160" cy="90" rx="136" ry="70" fill="none" stroke={color} strokeWidth="2" />
          <Ellipse cx="160" cy="90" rx="122" ry="58" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="3 3" />

          <Line x1="58" y1="56" x2="262" y2="124" stroke={color} strokeOpacity={0.16} strokeWidth="1.2" />
          <Line x1="262" y1="56" x2="58" y2="124" stroke={color} strokeOpacity={0.12} strokeWidth="1.2" />
          <Circle cx="82" cy="86" r="2" fill={color} fillOpacity={grainOpacity} />
          <Circle cx="240" cy="100" r="2.4" fill={color} fillOpacity={grainOpacity} />
          <Circle cx="170" cy="140" r="1.8" fill={color} fillOpacity={grainOpacity} />

          <SvgText fill={color} fontSize="12" fontWeight="800" letterSpacing="1">
            <TextPath href={`#topArc_${safeId}`} startOffset="50%" textAnchor="middle">
              VERIFIED TRAVEL STAMP
            </TextPath>
          </SvgText>

          <Rect x="58" y="70" width="204" height="40" rx="8" fill={color} fillOpacity={0.04} stroke={color} strokeWidth="2" />
          <SvgText x="160" y={ovalY} fill={color} fontSize={ovalFontSize} fontWeight="900" textAnchor="middle" textLength={title.length > 15 ? 190 : undefined} lengthAdjust="spacingAndGlyphs">
            {ovalTitle}
          </SvgText>

          <SvgText fill={color} fontSize="11" fontWeight="800" letterSpacing="0.8">
            <TextPath href={`#bottomArc_${safeId}`} startOffset="50%" textAnchor="middle">
              {`${subTitle} * ${dateText}`}
            </TextPath>
          </SvgText>
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.stampCircle, { width: size, height: size, backgroundColor: 'transparent', transform: [{ rotate: `${tilt}deg` }] }]}>
      <Svg width={size} height={size} viewBox="0 0 160 160">
        <Defs>
          <Path id={`ring_${safeId}`} d="M 80,80 m -56,0 a 56,56 0 1,1 112,0 a 56,56 0 1,1 -112,0" fill="none" />
        </Defs>

        <Circle cx="80" cy="80" r="74" fill={color} fillOpacity={0.03} stroke={color} strokeWidth="3" strokeDasharray={ringDash} />
        <Circle cx="80" cy="80" r="66" fill="none" stroke={color} strokeWidth="2" />
        <Circle cx="80" cy="80" r="54" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
        <Circle cx="45" cy="88" r="2" fill={color} fillOpacity={grainOpacity} />
        <Circle cx="112" cy="50" r="2.2" fill={color} fillOpacity={grainOpacity} />
        <Circle cx="120" cy="96" r="1.8" fill={color} fillOpacity={grainOpacity} />

        <SvgText fill={color} fontSize="9.5" fontWeight="900" letterSpacing="1.2">
          <TextPath href={`#ring_${safeId}`} startOffset="50%" textAnchor="middle">
            {` ${subTitle} * ${subTitle} * `}
          </TextPath>
        </SvgText>

        <Rect x="36" y="64" width="88" height="32" rx="6" fill={color} fillOpacity={0.04} stroke={color} strokeWidth="2" />
        <SvgText x="80" y={circleY} fill={color} fontSize={circleFontSize} fontWeight="900" textAnchor="middle" textLength={title.length > 9 ? 80 : undefined} lengthAdjust="spacingAndGlyphs">
          {circleTitle}
        </SvgText>
        <SvgText x="80" y="107" fill={color} fontSize="8.5" fontWeight="700" textAnchor="middle" letterSpacing="0.6">
          {dateText}
        </SvgText>
      </Svg>

      {stamp.count > 1 && (
        <View style={[styles.counterBadge, { backgroundColor: color }]}> 
          <Text style={styles.counterText}>x{stamp.count}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  stampCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stampOval: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 10,
  },
  counterText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
