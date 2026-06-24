import { Ionicons } from "@expo/vector-icons";
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@/lib/storage';
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

  // Guard: if post is not defined, render nothing
  if (!post) return null;

  const userForSave = currentUser || user;
  const userId =
    typeof userForSave === "string"
      ? userForSave
      : userForSave?.uid ||
      userForSave?.id ||
      userForSave?.userId ||
      userForSave?._id;

  const [saved, setSaved] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string>("");

  useEffect(() => {
    // Priority 1: Direct flags from backend (most reliable)
    const backendSaved = post?.isSaved || post?.saved || false;
    // Priority 2: ID match in savedBy array
    const idMatch = (resolvedUserId && post?.savedBy) ? post.savedBy.includes(resolvedUserId) : false;
    
    console.log(`[SaveButton] Debug: resolvedUserId=${resolvedUserId}, backendSaved=${backendSaved}, idMatch=${idMatch}`);
    setSaved(backendSaved || idMatch);
  }, [post?.savedBy, resolvedUserId, post?.isSaved, post?.saved, post?._id, post?.id]);

  // Ensure we always have the userId from storage as fallback
  useEffect(() => {
    if (userId) {
      setResolvedUserId(userId);
    } else {
      AsyncStorage.getItem("userId").then((id) => {
        if (id) setResolvedUserId(id);
      });
    }
  }, [userId]);

  useEffect(() => {
    const rawPid = post.id || post._id;
    if (!rawPid) return;
    const pid = String(rawPid).split('-loop')[0];
    const { feedEventEmitter } = require("../../lib/feedEventEmitter");
    const sub = feedEventEmitter.onPostUpdated(pid, (id: string, data: any) => {
      if (!data) return; // Guard against undefined data
      if (data.isSaved !== undefined) setSaved(data.isSaved);
      else if (data.saved !== undefined) setSaved(data.saved);
    });
    return () => sub.remove();
  }, [post.id, post._id]);

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

  const cleanPostId = String(post.id || post._id || "").split('-loop')[0];

  return (
    <>
      <TouchableOpacity onPress={handleSavePress} style={{ marginLeft: 0 }}>
        <Ionicons
          name={saved ? "bookmark" : "bookmark-outline"}
          size={22}
          color={saved ? "#FF8D00" : "#222"}
        />
      </TouchableOpacity>

      <SaveToCollectionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        postId={cleanPostId}
        postImageUrl={post.mediaUrl || post.imageUrl || post.media?.[0]?.url || undefined}
        currentUserId={resolvedUserId || userId}
        onSaveChange={(val: boolean) => setSaved(val)}
        initialGloballySaved={saved}
      />
    </>
  );
}