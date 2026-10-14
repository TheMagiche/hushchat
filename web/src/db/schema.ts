import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface IdentityRecord {
  id: string; // 'current'
  userId: string;
  ed25519Secret: Uint8Array;
  x25519Secret: Uint8Array;
  ed25519Pub: Uint8Array;
  x25519Pub: Uint8Array;
  profileName: string;
}

export interface ContactRecord {
  userId: string;
  name: string;
  ed25519Pub: Uint8Array;
  x25519Pub: Uint8Array;
  verified: boolean;
  blocked: boolean;
  lastSeenMs: number;
  status: string;
}

export interface ConversationRecord {
  id: string; // 'dm:userId' or 'room:roomId'
  type: 'dm' | 'room';
  title: string;
  lastLamport: number;
  unreadCount: number;
  previewText: string;
  updatedAtMs: number;
}

export interface MessageRecord {
  id: string;
  conversation: string;
  author: string;
  lamport: number;
  sentAtMs: number;
  body: unknown;
  sig: Uint8Array;
  isDelivered?: boolean;
}

export interface OutboxRecord {
  id: string;
  targetUserId: string;
  frameData: Uint8Array;
  queuedAtMs: number;
  retryCount: number;
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

export interface PeerChatDBSchema extends DBSchema {
  identity: {
    key: string;
    value: IdentityRecord;
  };
  contacts: {
    key: string;
    value: ContactRecord;
  };
  conversations: {
    key: string;
    value: ConversationRecord;
  };
  messages: {
    key: string;
    value: MessageRecord;
    indexes: {
      'by-conv-lamport': [string, number];
    };
  };
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: {
      'by-target': string;
    };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<PeerChatDBSchema>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PeerChatDBSchema>('peerchat-v1', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('identity')) {
          db.createObjectStore('identity', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'userId' });
        }
        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by-conv-lamport', ['conversation', 'lamport']);
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
          outboxStore.createIndex('by-target', 'targetUserId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}
