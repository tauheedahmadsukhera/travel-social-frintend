import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import VerifiedBadge from '../VerifiedBadge';

type DMHeaderProps = {
  displayName: string;
  avatarUri: string;
  isGroup: boolean;
  statusText?: string;
  onBack: () => void;
  onInfo: () => void;
  onTitlePress?: () => void;
  onCall?: () => void;
  onVideoCall?: () => void;
  verified?: boolean;
};

const DMHeader: React.FC<DMHeaderProps> = ({
  displayName,
  avatarUri,
  isGroup,
  statusText,
  onBack,
  onInfo,
  onTitlePress,
  onCall,
  onVideoCall,
  verified,
}) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Feather name="chevron-left" size={28} color="#000" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.headerTitle} onPress={onTitlePress || onInfo} activeOpacity={0.7}>
        <Image source={{ uri: avatarUri || DEFAULT_AVATAR_URL }} style={styles.headerAvatar} />
        <View style={styles.headerNameContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
            {!!verified && <VerifiedBadge size={14} />}
          </View>
          {statusText ? (
            <Text style={styles.headerStatus}>{statusText}</Text>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onInfo}>
          <Feather name="info" size={22} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#efefef',
  },
  headerNameContainer: {
    marginLeft: 10,
    justifyContent: 'center',
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  headerStatus: {
    fontSize: 11,
    color: '#0095f6',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 10,
    marginLeft: 2,
  },
});

export default React.memo(DMHeader);
