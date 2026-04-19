import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from 'expo-haptics';
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { TouchableOpacity, Alert } from "react-native";
import { useUser } from "./UserContext";
import { apiService } from "../_services/apiService";
import SaveToCollectionModal from "./SaveToCollectionModal";

async function savePost(postId: string, userId: string) {
  try {
    await apiService.post(`/users/${userId}/saved`, { postId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function unsavePost(postId: string, userId: string) {
  try {
    await apiService.delete(`/users/${userId}/saved/${postId}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export default function SaveButton({ post, currentUser }: any) {
  const user = useUser();
  const userForSave = currentUser || user;
  const userId =
    typeof userForSave === "string"
      ? userForSave
      : userForSave?.uid ||
      userForSave?.id ||
      userForSave?.userId ||
      userForSave?._id;

  const [saved, setSaved] = useState(post.savedBy?.includes(userId) ?? false);
  const [modalVisible, setModalVisible] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string>(userId || "");

  useEffect(() => {
    setSaved(post.savedBy?.includes(userId) ?? false);
  }, [post.savedBy, userId]);

  // Ensure we always have the userId from storage as fallback
  useEffect(() => {
    if (!resolvedUserId) {
      AsyncStorage.getItem("userId").then((id) => {
        if (id) setResolvedUserId(id);
      });
    } else {
      setResolvedUserId(userId || "");
    }
  }, [userId]);

  async function handleSavePress() {
    const uid = resolvedUserId || userId;
    if (!uid) {
      Alert.alert("Error", "User not logged in");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Always open collection modal.
    // Global "All" auto-save should be decided inside the modal after checking
    // whether this post already exists in any collection.
    setModalVisible(true);
  }

  return (
    <>
      <TouchableOpacity onPress={handleSavePress} style={{ marginLeft: 0 }}>
        <MaterialCommunityIcons
          name={saved ? "bookmark" : "bookmark-outline"}
          size={24}
          color={saved ? "#0A3D62" : "#222"}
        />
      </TouchableOpacity>

      <SaveToCollectionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        postId={post.id || post._id || ""}
        postImageUrl={post.mediaUrl || post.imageUrl || post.media?.[0]?.url || undefined}
        currentUserId={resolvedUserId || userId}
        onSaveChange={(val: boolean) => setSaved(val)}
        initialGloballySaved={saved}
      />
    </>
  );
}