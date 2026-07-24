import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ErrorBoundary from '@/src/components/ErrorBoundary';

export default function PostScreen() {
  const { postId, commentId, mentionId, tagId } = useLocalSearchParams();
  // Debug log for params
  React.useEffect(() => {
    console.log('[POST SCREEN PARAMS]', { postId, commentId, mentionId, tagId });
  }, [postId, commentId, mentionId, tagId]);
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Helper to fetch comment text by commentId
  const [highlightedComment, setHighlightedComment] = React.useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    
    // TODO: Implement backend API to fetch post by ID
    // const response = await fetch(`/api/posts/${postId}`);
    // const post = await response.json();
    // setPost(post);
    
    setPost(null);
    setLoading(false);
  }, [postId]);

  React.useEffect(() => {
    setHighlightedComment(null);
  }, [commentId, postId]);

  if (!postId) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.notFound}>No postId provided. Cannot load post.</Text>
      </SafeAreaView>
    );
  }
  if (loading) return (
    <SafeAreaView style={styles.container}>
      <View style={{ padding: 24 }}>
        <View style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: '#eee', marginBottom: 16 }} />
        <View style={{ width: 120, height: 24, borderRadius: 8, backgroundColor: '#eee', marginBottom: 12 }} />
        <View style={{ width: '80%', height: 16, borderRadius: 6, backgroundColor: '#eee', marginBottom: 8 }} />
        <View style={{ width: '60%', height: 16, borderRadius: 6, backgroundColor: '#eee', marginBottom: 8 }} />
      </View>
    </SafeAreaView>
  );

  if (!post) return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.notFound}>Post not found.</Text>
    </SafeAreaView>
  );

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.header}>Post Details</Text>
          {/* Highlight post caption for like notifications */}
          {postId && !commentId && (
            <Text style={[styles.highlight, { backgroundColor: '#fffbe6', padding: 8, borderRadius: 8 }]}>Post: {post.caption}</Text>
          )}
          {/* Show comment, mention, or tag highlight if param exists */}
          {commentId && highlightedComment && (
            <Text style={[styles.highlight, { backgroundColor: '#eaf3ff', padding: 8, borderRadius: 8 }]}>Comment: {highlightedComment}</Text>
          )}
          {commentId && !highlightedComment && (
            <Text style={styles.highlight}>Comment not found.</Text>
          )}
          {mentionId && <Text style={styles.highlight}>Mention: {mentionId}</Text>}
          {tagId && <Text style={styles.highlight}>Tag: {tagId}</Text>}
          {/* Add more post details as needed */}
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24 },
  header: { fontWeight: '700', fontSize: 24, color: '#FF6B00', marginBottom: 16 },
  caption: { fontSize: 16, color: '#222', marginBottom: 12 },
  highlight: { fontSize: 15, color: '#007aff', marginBottom: 8 },
  notFound: { fontSize: 18, color: '#d00', textAlign: 'center', marginTop: 40 },
});
