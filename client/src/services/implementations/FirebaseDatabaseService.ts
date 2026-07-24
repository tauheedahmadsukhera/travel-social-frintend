/**
 * Firebase Firestore Implementation
 * To switch to another database (Supabase, MongoDB), create a new implementation
 */

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment as firestoreIncrement,
  onSnapshot,
  query,
  serverTimestamp as firestoreServerTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { BatchOperation, IDatabaseService, QueryFilter } from '../interfaces/IDatabaseService';

export class FirebaseDatabaseService implements IDatabaseService {
  async create<T>(collectionName: string, data: T): Promise<string> {
    const docRef = await addDoc(collection(db, collectionName), data as any);
    return docRef.id;
  }

  async createWithId<T>(collectionName: string, id: string, data: T): Promise<void> {
    await setDoc(doc(db, collectionName, id), data as any);
  }

  async getById<T>(collectionName: string, id: string): Promise<T | null> {
    const docSnap = await getDoc(doc(db, collectionName, id));
    return docSnap.exists() ? (docSnap.data() as T) : null;
  }

  async getAll<T>(collectionName: string): Promise<T[]> {
    const querySnapshot = await getDocs(collection(db, collectionName));
    return querySnapshot.docs.map(doc => doc.data() as T);
  }

  async query<T>(collectionName: string, filters: QueryFilter[]): Promise<T[]> {
    let q = query(collection(db, collectionName));
    
    filters.forEach(filter => {
      q = query(q, where(filter.field, filter.operator, filter.value));
    });
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
  }

  async update<T>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    await updateDoc(doc(db, collectionName, id), data as any);
  }

  async increment(collectionName: string, id: string, field: string, value: number): Promise<void> {
    await updateDoc(doc(db, collectionName, id), {
      [field]: firestoreIncrement(value)
    });
  }

  async arrayUnion(collectionName: string, id: string, field: string, value: any): Promise<void> {
    await updateDoc(doc(db, collectionName, id), {
      [field]: arrayUnion(value)
    });
  }

  async arrayRemove(collectionName: string, id: string, field: string, value: any): Promise<void> {
    await updateDoc(doc(db, collectionName, id), {
      [field]: arrayRemove(value)
    });
  }

  async delete(collectionName: string, id: string): Promise<void> {
    await deleteDoc(doc(db, collectionName, id));
  }

  onSnapshot<T>(collectionName: string, id: string, callback: (data: T | null) => void): () => void {
    return onSnapshot(doc(db, collectionName, id), (docSnap) => {
      callback(docSnap.exists() ? (docSnap.data() as T) : null);
    });
  }

  onCollectionSnapshot<T>(collectionName: string, filters: QueryFilter[], callback: (data: T[]) => void): () => void {
    let q = query(collection(db, collectionName));
    
    filters.forEach(filter => {
      q = query(q, where(filter.field, filter.operator, filter.value));
    });
    
    return onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
      callback(data);
    });
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    const batch = writeBatch(db);
    
    operations.forEach(op => {
      const docRef = doc(db, op.collection, op.id || '');
      
      if (op.type === 'create' || op.type === 'update') {
        batch.set(docRef, op.data, { merge: op.type === 'update' });
      } else if (op.type === 'delete') {
        batch.delete(docRef);
      }
    });
    
    await batch.commit();
  }

  serverTimestamp(): any {
    return firestoreServerTimestamp();
  }
}

