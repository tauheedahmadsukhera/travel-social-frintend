/**
 * Firebase Compatibility Helpers
 * These provide Firebase-like functionality using the backend API
 */

import AsyncStorage from '@/lib/storage';

// Mock Firebase Timestamp for serverTimestamp()
export function serverTimestamp() {
  return new Date().toISOString();
}

// Mock Firestore doc reference (returns a proxy object)
export function doc(db: any, ...path: string[]) {
  return {
    __isDocRef: true,
    path: path,
    db
  };
}

// Mock Firestore database reference
export const db = { __isMockDb: true };

// Mock setDoc function - converts to API call
export async function setDoc(docRef: any, data: any, options?: { merge?: boolean }) {
  try {
    if (!docRef || !docRef.path) {
      throw new Error('Invalid doc reference');
    }
    
    const [collection, docId] = docRef.path;
    const endpoint = `/api/${collection.toLowerCase()}/${docId}`;
    
    const method = options?.merge ? 'PATCH' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    return result;
  } catch (error: any) {
    console.error('setDoc error:', error);
    throw error;
  }
}

// Mock updateDoc function - converts to API call
export async function updateDoc(docRef: any, data: any) {
  try {
    if (!docRef || !docRef.path) {
      throw new Error('Invalid doc reference');
    }
    
    const [collection, docId] = docRef.path;
    const endpoint = `/api/${collection.toLowerCase()}/${docId}`;
    
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    return result;
  } catch (error: any) {
    console.error('updateDoc error:', error);
    throw error;
  }
}

// Mock Firebase Auth object
export const auth = {
  currentUser: null
};

// Helper function to get current user (returns sync version)
export async function getCurrentFirebaseUser() {
  try {
    const userId = await AsyncStorage.getItem('userId');
    return userId ? { uid: userId, userId } : null;
  } catch (error) {
    return null;
  }
}


