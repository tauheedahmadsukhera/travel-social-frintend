import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

interface VisibilitySettingsScreenProps {
  currentVisibility: 'public' | 'private' | 'specific';
  onConfirm: (v: 'public' | 'private' | 'specific') => void;
  groups: any[];
  tempSelectedGroups: string[];
  onToggleGroup: (group: any) => void;
  loadingGroups: boolean;
  onGoBack: () => void;
  Header: any;
}

export const VisibilitySettingsScreen: React.FC<VisibilitySettingsScreenProps> = ({
  currentVisibility,
  onConfirm,
  groups,
  tempSelectedGroups,
  onToggleGroup,
  loadingGroups,
  onGoBack,
  Header,
}) => {
  const options: { key: 'public' | 'private'; label: string; sub: string }[] = [
    { key: 'public', label: 'Public', sub: 'Anyone can see this collection' },
    { key: 'private', label: 'Private', sub: 'Only you can see this collection' },
  ];

  return (
    <>
      <Header title="Visibility" onLeft={onGoBack} />
      <ScrollView style={{ flex: 1 }}>
        {options.map(opt => (
          <View key={opt.key}>
            <TouchableOpacity
              style={styles.visRow}
              onPress={() => onConfirm(opt.key)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.visLabel}>{opt.label}</Text>
                <Text style={styles.visSub}>{opt.sub}</Text>
              </View>
              {currentVisibility === opt.key && (
                <Ionicons name="checkmark" size={20} color="#FF8D00" />
              )}
            </TouchableOpacity>
            <View style={styles.divider} />
          </View>
        ))}

        <TouchableOpacity
          style={styles.visRow}
          onPress={() => onConfirm('specific')}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.visLabel}>Specific Groups</Text>
            <Text style={styles.visSub}>Only members of selected groups can see</Text>
          </View>
          {currentVisibility === 'specific' && (
            <Ionicons name="checkmark" size={20} color="#FF8D00" />
          )}
        </TouchableOpacity>

        {currentVisibility === 'specific' && (
          <View style={styles.groupsContainer}>
            <Text style={styles.groupsLabel}>Select Groups</Text>
            {loadingGroups ? (
              <ActivityIndicator color="#FF8D00" style={{ marginVertical: 20 }} />
            ) : groups.length === 0 ? (
              <Text style={styles.noGroupsText}>No groups found</Text>
            ) : (
              groups.map(g => {
                const isSelected = tempSelectedGroups.some(sid => String(sid) === String(g._id));
                return (
                  <TouchableOpacity
                    key={g._id}
                    style={styles.groupItem}
                    onPress={() => onToggleGroup(g)}
                  >
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? "#FF8D00" : "#ccc"}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  visRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  visLabel: { fontSize: 16, fontWeight: '700', color: '#111' },
  visSub: { fontSize: 13, color: '#666', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },
  groupsContainer: { backgroundColor: '#f9f9f9', paddingHorizontal: 16, paddingVertical: 12 },
  groupsLabel: { fontSize: 13, fontWeight: '800', color: '#666', textTransform: 'uppercase', marginBottom: 12 },
  noGroupsText: { fontSize: 14, color: '#999', textAlign: 'center', marginVertical: 12 },
  groupItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  groupName: { fontSize: 15, color: '#111', fontWeight: '500' },
});
