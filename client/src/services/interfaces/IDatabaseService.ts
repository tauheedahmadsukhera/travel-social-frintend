/**
 * Database Service Interface
 * Implement this interface to switch between Firebase Firestore, Supabase, MongoDB, etc.
 */

export interface IDatabaseService {
  // Create
  create<T>(collection: string, data: T): Promise<string>; // Returns document ID
  createWithId<T>(collection: string, id: string, data: T): Promise<void>;
  
  // Read
  getById<T>(collection: string, id: string): Promise<T | null>;
  getAll<T>(collection: string): Promise<T[]>;
  query<T>(collection: string, filters: QueryFilter[]): Promise<T[]>;
  
  // Update
  update<T>(collection: string, id: string, data: Partial<T>): Promise<void>;
  increment(collection: string, id: string, field: string, value: number): Promise<void>;
  arrayUnion(collection: string, id: string, field: string, value: any): Promise<void>;
  arrayRemove(collection: string, id: string, field: string, value: any): Promise<void>;
  
  // Delete
  delete(collection: string, id: string): Promise<void>;
  
  // Real-time listeners
  onSnapshot<T>(
    collection: string,
    id: string,
    callback: (data: T | null) => void
  ): () => void;
  
  onCollectionSnapshot<T>(
    collection: string,
    filters: QueryFilter[],
    callback: (data: T[]) => void
  ): () => void;
  
  // Batch operations
  batch(operations: BatchOperation[]): Promise<void>;
  
  // Server timestamp
  serverTimestamp(): any;
}

export interface QueryFilter {
  field: string;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
  value: any;
}

export interface BatchOperation {
  type: 'create' | 'update' | 'delete';
  collection: string;
  id?: string;
  data?: any;
}

