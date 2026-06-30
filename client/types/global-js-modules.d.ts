declare module '../../config/firebase' {
  import { Auth } from 'firebase/auth';
    import { Firestore } from 'firebase/firestore';
    import { FirebaseStorage } from 'firebase/storage';
  export const db: Firestore;
  export const auth: Auth;
  export const storage: FirebaseStorage;
}
declare module '../lib/firebaseHelpers/archive' {
  export const archiveConversation: any;
  export const unarchiveConversation: any;
  export const getArchivedConversations: any;
}

declare module '../lib/firebaseHelpers/archive.js' {
  export const archiveConversation: any;
  export const unarchiveConversation: any;
  export const getArchivedConversations: any;
}

declare module '../config/agora' {
  export const AGORA_CONFIG: any;
  export const getAgoraToken: any;
}

declare module '../config/agora.js' {
  export const AGORA_CONFIG: any;
  export const getAgoraToken: any;
}

// Add declarations for imports using two-level up paths
declare module '../../config/agora' {
  export const AGORA_CONFIG: any;
  export const getAgoraToken: any;
}

declare module '../../config/agora.js' {
  export const AGORA_CONFIG: any;
  export const getAgoraToken: any;
}
declare module '../lib/firebaseHelpers/archive' {
  export const archiveConversation: any;
  export const unarchiveConversation: any;
  export const getArchivedConversations: any;
}

declare module '../config/agora' {
  export const AGORA_CONFIG: any;
  export const getAgoraToken: any;
}

declare module '../lib/firebaseHelpers/archive.js' {
  export const archiveConversation: any;
  export const unarchiveConversation: any;
  export const getArchivedConversations: any;
}

declare module '../config/agora.js' {
  export const AGORA_CONFIG: any;
  export const getAgoraToken: any;
}

declare module '*.png' {
  const content: any;
  export default content;
}

declare module '*.jpg' {
  const content: any;
  export default content;
}

declare module '*.jpeg' {
  const content: any;
  export default content;
}

declare module '*.gif' {
  const content: any;
  export default content;
}

declare module '*.svg' {
  const content: any;
  export default content;
}
