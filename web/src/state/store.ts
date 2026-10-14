import { create } from 'zustand';
import { initWasm, WasmModule } from '../wasm/loader';
import { getDB, IdentityRecord, ContactRecord, ConversationRecord, MessageRecord } from '../db/schema';

export interface PeerItem {
  userId: string;
  peerjsId: string;
  name: string;
  ed25519Pub: Uint8Array;
  isAnchor: boolean;
  verified?: boolean;
}

export interface ChatStoreState {
  wasm: WasmModule | null;
  identity: IdentityRecord | null;
  peerjsId: string | null;
  currentRoom: string | null;
  currentDM: string | null;
  peers: Map<string, PeerItem>;
  messages: MessageRecord[];
  contacts: ContactRecord[];
  conversations: ConversationRecord[];
  typingUsers: Set<string>;
  callActive: boolean;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  hideMyIP: boolean;
  relayOnly: boolean;

  initApp: () => Promise<void>;
  setProfileName: (name: string) => Promise<void>;
  addMessage: (msg: MessageRecord) => Promise<void>;
  setPeers: (peers: PeerItem[]) => void;
  addPeer: (peer: PeerItem) => void;
  removePeer: (userId: string) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  loadHistory: (convId: string) => Promise<void>;
  addContact: (contact: ContactRecord) => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreen: () => void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  wasm: null,
  identity: null,
  peerjsId: null,
  currentRoom: null,
  currentDM: null,
  peers: new Map(),
  messages: [],
  contacts: [],
  conversations: [],
  typingUsers: new Set(),
  callActive: false,
  localStream: null,
  remoteStreams: new Map(),
  micEnabled: true,
  cameraEnabled: true,
  screenEnabled: false,
  hideMyIP: false,
  relayOnly: false,

  initApp: async () => {
    const wasm = await initWasm();
    const db = await getDB();
    let currentId = await db.get('identity', 'current');

    if (!currentId) {
      const wasmId = new wasm.WasmIdentity();
      const userId = wasmId.userId();
      const ed25519Pub = new Uint8Array(wasmId.ed25519Pub());
      const x25519Pub = new Uint8Array(wasmId.x25519Pub());

      currentId = {
        id: 'current',
        userId,
        ed25519Secret: new Uint8Array(32),
        x25519Secret: new Uint8Array(32),
        ed25519Pub,
        x25519Pub,
        profileName: `Peer-${userId.slice(-4)}`,
      };
      await db.put('identity', currentId);
    }

    const contacts = await db.getAll('contacts');
    const conversations = await db.getAll('conversations');

    set({
      wasm,
      identity: currentId,
      contacts,
      conversations,
    });
  },

  setProfileName: async (name: string) => {
    const { identity } = get();
    if (!identity) return;
    const db = await getDB();
    const updated = { ...identity, profileName: name };
    await db.put('identity', updated);
    set({ identity: updated });
  },

  addMessage: async (msg: MessageRecord) => {
    const { messages, conversations } = get();
    const exists = messages.some((m) => m.id === msg.id);
    if (exists) return;

    const newMessages = [...messages, msg].sort((a, b) => a.lamport - b.lamport || a.sentAtMs - b.sentAtMs);
    set({ messages: newMessages });

    const db = await getDB();
    await db.put('messages', msg);

    // Update conversation preview
    const convId = msg.conversation;
    const existingConv = conversations.find((c) => c.id === convId);
    const bodyObj = msg.body as { Text?: { markdown: string }; System?: unknown };
    const preview = bodyObj?.Text?.markdown || 'Sent a message';

    const updatedConv: ConversationRecord = {
      id: convId,
      type: convId.startsWith('dm:') ? 'dm' : 'room',
      title: existingConv?.title || convId,
      lastLamport: msg.lamport,
      unreadCount: 0,
      previewText: preview.slice(0, 60),
      updatedAtMs: msg.sentAtMs,
    };

    await db.put('conversations', updatedConv);
    const updatedList = conversations.filter((c) => c.id !== convId).concat(updatedConv);
    set({ conversations: updatedList.sort((a, b) => b.updatedAtMs - a.updatedAtMs) });
  },

  setPeers: (peersList: PeerItem[]) => {
    const map = new Map<string, PeerItem>();
    for (const p of peersList) {
      map.set(p.userId, p);
    }
    set({ peers: map });
  },

  addPeer: (peer: PeerItem) => {
    const peers = new Map(get().peers);
    peers.set(peer.userId, peer);
    set({ peers });
  },

  removePeer: (userId: string) => {
    const peers = new Map(get().peers);
    peers.delete(userId);
    set({ peers });
  },

  setTyping: (userId: string, isTyping: boolean) => {
    const typingUsers = new Set(get().typingUsers);
    if (isTyping) typingUsers.add(userId);
    else typingUsers.delete(userId);
    set({ typingUsers });
  },

  loadHistory: async (convId: string) => {
    const db = await getDB();
    const tx = db.transaction('messages', 'readonly');
    const index = tx.store.index('by-conv-lamport');
    const all = await index.getAll(IDBKeyRange.bound([convId, 0], [convId, Number.MAX_SAFE_INTEGER]));
    set({ messages: all });
  },

  addContact: async (contact: ContactRecord) => {
    const db = await getDB();
    await db.put('contacts', contact);
    const contacts = await db.getAll('contacts');
    set({ contacts });
  },

  toggleMic: () => {
    const { localStream, micEnabled } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = !micEnabled));
    }
    set({ micEnabled: !micEnabled });
  },

  toggleCamera: () => {
    const { localStream, cameraEnabled } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = !cameraEnabled));
    }
    set({ cameraEnabled: !cameraEnabled });
  },

  toggleScreen: () => {
    set((s) => ({ screenEnabled: !s.screenEnabled }));
  },
}));
