import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '../../../lib/api';

interface PostDetailsFormProps {
  caption: string;
  setCaption: (text: string) => void;
  hashtags: string[];
  hashtagInput: string;
  onHashtagInputChange: (text: string) => void;
  onHashtagCommit: () => void;
  onRemoveTag: (tag: string) => void;
  selectedCategories: { name: string; image: string }[];
  onOpenCategories: () => void;
  onRemoveCategory: (name: string) => void;
  locationName?: string;
  onOpenLocation: () => void;
  verifiedLocation?: any;
  onOpenVerifiedLocation: () => void;
  taggedUsers: any[];
  onOpenTagPeople: () => void;
  onRemoveTaggedUser: (uid: string) => void;
  visibility: string;
  onOpenVisibility: () => void;
}

const PostDetailsForm: React.FC<PostDetailsFormProps> = ({
  caption, setCaption, hashtags, hashtagInput, onHashtagInputChange, onHashtagCommit, onRemoveTag,
  selectedCategories, onOpenCategories, onRemoveCategory, locationName, onOpenLocation,
  verifiedLocation, onOpenVerifiedLocation, taggedUsers, onOpenTagPeople, onRemoveTaggedUser,
  visibility, onOpenVisibility
}) => {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ paddingHorizontal: 15 }}>
        {/* Caption Input Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
          <Feather name="align-justify" size={18} color="#333" style={{ marginRight: 15 }} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: '#000', fontWeight: '500' }}
            placeholder="Add a text"
            placeholderTextColor="#333"
            value={caption}
            onChangeText={setCaption}
            multiline={false}
          />
        </View>

        {/* Tags Row */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
            <Feather name="hash" size={18} color="#333" style={{ marginRight: 15 }} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: '#000', fontWeight: '500' }}
              placeholder="Add tags"
              placeholderTextColor="#333"
              value={hashtagInput}
              onChangeText={onHashtagInputChange}
              onSubmitEditing={onHashtagCommit}
            />
          </View>
          {hashtags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 10, paddingLeft: 35 }}>
              {hashtags.map(tag => (
                <View key={tag} style={{ backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, flexDirection: 'row', alignItems: 'center', marginRight: 8, marginBottom: 5 }}>
                  <Text style={{ color: '#333', fontSize: 12 }}>#{tag}</Text>
                  <TouchableOpacity onPress={() => onRemoveTag(tag)} style={{ marginLeft: 5 }}>
                    <Feather name="x" size={12} color="#666" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Category Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }} onPress={onOpenCategories}>
          <Feather name="bookmark" size={18} color="#333" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: selectedCategories.length > 0 ? '#000' : '#333' }}>
              {selectedCategories.length > 0 ? selectedCategories.map(c => c.name).join(', ') : 'Add a category for the home feed'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Location Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }} onPress={onOpenLocation}>
          <Feather name="map-pin" size={18} color="#333" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            {locationName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ 
                  backgroundColor: '#f5f5f5', 
                  paddingHorizontal: 12, 
                  paddingVertical: 6, 
                  borderRadius: 20, 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#e0e0e0'
                }}>
                  <Feather name="map-pin" size={12} color="#666" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#333', fontSize: 14, fontWeight: '500' }}>{locationName}</Text>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#333' }}>Add a location</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Verified Location Row */}
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }} 
          onPress={onOpenVerifiedLocation}
        >
          <Feather name="lock" size={18} color="#333" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            {verifiedLocation ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ 
                  backgroundColor: '#E3F2FD', 
                  paddingHorizontal: 12, 
                  paddingVertical: 6, 
                  borderRadius: 20, 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#90CAF9',
                  maxWidth: '95%'
                }}>
                  <Feather name="check-circle" size={14} color="#1976D2" style={{ marginRight: 6 }} />
                  <Text 
                    style={{ color: '#1976D2', fontSize: 14, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {verifiedLocation.name || verifiedLocation.placeName || (verifiedLocation.address ? verifiedLocation.address.split(',')[0] : 'Verified Location')}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#333' }}>Add a verified location</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Tag People Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }} onPress={onOpenTagPeople}>
          <Feather name="user-plus" size={18} color="#333" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: taggedUsers.length > 0 ? '#000' : '#333' }}>
              {taggedUsers.length > 0 ? `${taggedUsers.length} people tagged` : 'Tag people'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Visibility Row */}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }} onPress={onOpenVisibility}>
          <Feather name="eye" size={18} color="#333" style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#333' }}>
              Post visibility{visibility !== 'Everyone' ? `: ${visibility}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PostDetailsForm;
