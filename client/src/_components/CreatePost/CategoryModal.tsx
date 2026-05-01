import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, TextInput, Image, PanResponder } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { getCategoryImageSource } from '../../../lib/categoryImages';

interface CategoryModalProps {
  visible: boolean;
  onClose: () => void;
  categories: { name: string; image: string }[];
  selectedCategories: { name: string; image: string }[];
  onSelect: (category: { name: string; image: string }) => void;
  categorySearch: string;
  onSearchChange: (text: string) => void;
  panResponder: any;
}

const CategoryModal: React.FC<CategoryModalProps> = ({
  visible,
  onClose,
  categories,
  selectedCategories,
  onSelect,
  categorySearch,
  onSearchChange,
  panResponder,
}) => {
  const filtered = categories.filter(c => 
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View 
          {...panResponder.panHandlers}
          style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%', padding: 20 }}
        >
          <View style={{ width: 40, height: 5, backgroundColor: '#ddd', borderRadius: 5, alignSelf: 'center', marginBottom: 15 }} />
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '700' }}>Select Categories</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 12, marginBottom: 20 }}>
            <Feather name="search" size={18} color="#999" />
            <TextInput
              placeholder="Search categories..."
              style={{ flex: 1, paddingVertical: 12, marginLeft: 8 }}
              value={categorySearch}
              onChangeText={onSearchChange}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.name}
            renderItem={({ item }) => {
              const isSelected = selectedCategories.some(c => c.name === item.name);
              return (
                <TouchableOpacity
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    paddingVertical: 12, 
                    paddingHorizontal: 12, 
                    backgroundColor: isSelected ? '#f0f7ff' : 'transparent',
                    borderRadius: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: isSelected ? '#007aff' : 'transparent'
                  }}
                  onPress={() => onSelect(item)}
                >
                  <Image
                    source={getCategoryImageSource(item.name, item.image)}
                    style={{ width: 50, height: 50, borderRadius: 12, marginRight: 15 }}
                  />
                  <Text style={{ fontSize: 16, fontWeight: isSelected ? '600' : '400', color: isSelected ? '#007aff' : '#000' }}>
                    {item.name}
                  </Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color="#007aff" style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(CategoryModal);
