import { create } from 'zustand';
import { initWasm, WasmModule } from '../wasm/loader';
import { WasmIdentity } from '../wasm/pkg/peerchat_wasm';
import { getDB, IdentityRecord, ContactRecord, ConversationRecord, MessageRecord } from '../db/schema';

export interface PeerItem {
  userId: string;
  peerjsId: string;
  name: string;
  ed25519Pub: Uint8Array;
  isAnchor: boolean;
  verified?: boolean;
}

export interface IncomingCallInfo {
  callerPeerId: string;
  callerUserId?: string;
  callerName?: string;
  mediaConn?: any;
}

export interface ChatStoreState {
  wasm: WasmModule | null;
  wasmIdentity: WasmIdentity | null;
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
  incomingCall: IncomingCallInfo | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  hideMyIP: boolean;
  relayOnly: boolean;

  initApp: () => Promise<void>;
  getWasmIdentity: () => WasmIdentity | null;
  setProfileName: (name: string) => Promise<void>;
  addMessage: (msg: MessageRecord) => Promise<void>;
  deleteMessage: (msgId: string, convId?: string) => Promise<void>;
  clearConversationMessages: (convId: string) => Promise<void>;
  deleteConversation: (convId: string) => Promise<void>;
  setPeers: (peers: PeerItem[]) => void;
  addPeer: (peer: PeerItem) => void;
  removePeer: (userId: string) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  setIncomingCall: (call: IncomingCallInfo | null) => void;
  loadHistory: (convId: string) => Promise<void>;
  addContact: (contact: ContactRecord) => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreen: () => void;
}

function normalizeConvId(convId: string): string {
  if (convId.startsWith('dm:')) {
    return `dm:${convId.replace(/^dm:/, '')}`;
  }
  const cleanRoom = convId.replace(/^room:/, '').replace(/^#+/, '').replace(/^room:/, '').trim() || 'general';
  return `room:${cleanRoom}`;
}

function normalizeConvTitle(convId: string, defaultName?: string): string {
  if (convId.startsWith('dm:')) {
    return defaultName || convId.replace(/^dm:/, '').slice(0, 10);
  }
  const cleanRoom = convId.replace(/^room:/, '').replace(/^#+/, '').replace(/^room:/, '').trim() || 'general';
  return `#${cleanRoom}`;
}

const sortMessagesByTime = (a: MessageRecord, b: MessageRecord) => {
  const timeDiff = (a.sentAtMs || 0) - (b.sentAtMs || 0);
  if (timeDiff !== 0) return timeDiff;
  return (a.lamport || 0) - (b.lamport || 0);
};

export const useChatStore = create<ChatStoreState>((set, get) => ({
  wasm: null,
  wasmIdentity: null,
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
  incomingCall: null,
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
    let wasmId: WasmIdentity;

    if (
      currentId &&
      currentId.ed25519Secret &&
      currentId.ed25519Secret.length === 32 &&
      currentId.ed25519Secret.some((b) => b !== 0)
    ) {
      try {
        wasmId = wasm.WasmIdentity.fromSecrets(
          currentId.ed25519Secret,
          currentId.x25519Secret
        );
      } catch {
        wasmId = new wasm.WasmIdentity();
        currentId = {
          id: 'current',
          userId: wasmId.userId(),
          ed25519Secret: new Uint8Array(wasmId.ed25519Secret()),
          x25519Secret: new Uint8Array(wasmId.x25519Secret()),
          ed25519Pub: new Uint8Array(wasmId.ed25519Pub()),
          x25519Pub: new Uint8Array(wasmId.x25519Pub()),
          profileName: currentId?.profileName || `Peer-${wasmId.userId().slice(-4)}`,
        };
        await db.put('identity', currentId);
      }
    } else {
      wasmId = new wasm.WasmIdentity();
      const userId = wasmId.userId();
      currentId = {
        id: 'current',
        userId,
        ed25519Secret: new Uint8Array(wasmId.ed25519Secret()),
        x25519Secret: new Uint8Array(wasmId.x25519Secret()),
        ed25519Pub: new Uint8Array(wasmId.ed25519Pub()),
        x25519Pub: new Uint8Array(wasmId.x25519Pub()),
        profileName: currentId?.profileName || `Peer-${userId.slice(-4)}`,
      };
      await db.put('identity', currentId);
    }

    const contacts = await db.getAll('contacts');
    const rawConversations = await db.getAll('conversations');

    // Deduplicate and clean any legacy malformed room keys
    const convMap = new Map<string, ConversationRecord>();
    for (const c of rawConversations) {
      const normalizedId = normalizeConvId(c.id);
      const normalizedTitle = normalizeConvTitle(normalizedId, c.title);
      const existing = convMap.get(normalizedId);
      if (!existing || c.updatedAtMs > existing.updatedAtMs) {
        convMap.set(normalizedId, {
          ...c,
          id: normalizedId,
          type: normalizedId.startsWith('dm:') ? 'dm' : 'room',
          title: normalizedTitle,
        });
      }
      if (c.id !== normalizedId) {
        await db.delete('conversations', c.id);
      }
    }

    const dedupedConvs = Array.from(convMap.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    for (const c of dedupedConvs) {
      await db.put('conversations', c);
    }

    set({
      wasm,
      wasmIdentity: wasmId,
      identity: currentId,
      contacts,
      conversations: dedupedConvs,
    });
  },

  getWasmIdentity: () => {
    const { wasm, wasmIdentity, identity } = get();
    if (wasmIdentity) return wasmIdentity;
    if (wasm && identity && identity.ed25519Secret?.some((b) => b !== 0)) {
      try {
        const id = wasm.WasmIdentity.fromSecrets(identity.ed25519Secret, identity.x25519Secret);
        set({ wasmIdentity: id });
        return id;
      } catch {
        // fallback
      }
    }
    return null;
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
    const { messages, conversations, identity } = get();
    const exists = messages.some((m) => m.id === msg.id);
    if (exists) return;

    let convId = normalizeConvId(msg.conversation);
    // Normalize DM conversation ID so incoming DM messages are stored under dm:<remoteAuthor>
    if (convId.startsWith('dm:') && identity && msg.author !== identity.userId) {
      convId = `dm:${msg.author}`;
    }
    msg = { ...msg, conversation: convId };

    const newMessages = [...messages, msg].sort(sortMessagesByTime);
    set({ messages: newMessages });

    const db = await getDB();
    await db.put('messages', msg);

    // Update conversation preview
    const existingConv = conversations.find((c) => c.id === convId);
    const bodyObj = msg.body as {
      Text?: { markdown: string };
      File?: { name: string };
      Delete?: { target: string };
      System?: unknown;
    };

    if (bodyObj?.Delete?.target) {
      // If this message is a delete instruction, remove the target
      await get().deleteMessage(bodyObj.Delete.target, convId);
      return;
    }

    let preview = 'Sent a message';
    if (bodyObj?.Text?.markdown) {
      preview = bodyObj.Text.markdown;
    } else if (bodyObj?.File?.name) {
      preview = `Shared file: ${bodyObj.File.name}`;
    }

    const updatedConv: ConversationRecord = {
      id: convId,
      type: convId.startsWith('dm:') ? 'dm' : 'room',
      title: normalizeConvTitle(convId, existingConv?.title || (bodyObj?.Text ? msg.author.slice(0, 10) : undefined)),
      lastLamport: msg.lamport,
      unreadCount: 0,
      previewText: preview.slice(0, 60),
      updatedAtMs: msg.sentAtMs,
    };

    await db.put('conversations', updatedConv);
    const updatedList = conversations.filter((c) => c.id !== convId).concat(updatedConv);
    set({ conversations: updatedList.sort((a, b) => b.updatedAtMs - a.updatedAtMs) });
  },

  deleteMessage: async (msgId: string, convId?: string) => {
    const { messages, conversations } = get();
    const filtered = messages.filter((m) => m.id !== msgId);
    set({ messages: filtered });

    const db = await getDB();
    await db.delete('messages', msgId);

    // Update conversation preview if needed
    const targetConvId = convId ? normalizeConvId(convId) : null;
    if (targetConvId) {
      const remainingForConv = filtered.filter((m) => m.conversation === targetConvId);
      const lastMsg = remainingForConv[remainingForConv.length - 1];
      const existingConv = conversations.find((c) => c.id === targetConvId);
      if (existingConv) {
        let preview = 'No messages';
        if (lastMsg) {
          const bodyObj = lastMsg.body as { Text?: { markdown: string }; File?: { name: string } };
          preview = bodyObj?.Text?.markdown || (bodyObj?.File?.name ? `Shared file: ${bodyObj.File.name}` : 'Sent a message');
        }
        const updatedConv: ConversationRecord = {
          ...existingConv,
          previewText: preview.slice(0, 60),
          updatedAtMs: lastMsg ? lastMsg.sentAtMs : existingConv.updatedAtMs,
        };
        await db.put('conversations', updatedConv);
        const updatedList = conversations.map((c) => (c.id === targetConvId ? updatedConv : c));
        set({ conversations: updatedList.sort((a, b) => b.updatedAtMs - a.updatedAtMs) });
      }
    }
  },

  clearConversationMessages: async (convId: string) => {
    const normalizedId = normalizeConvId(convId);
    const db = await getDB();
    const all = await db.getAll('messages');
    for (const msg of all) {
      if (msg.conversation === normalizedId) {
        await db.delete('messages', msg.id);
      }
    }

    set((state) => ({
      messages: state.messages.filter((m) => m.conversation !== normalizedId),
    }));

    // Update conversation record
    const { conversations } = get();
    const existing = conversations.find((c) => c.id === normalizedId);
    if (existing) {
      const updatedConv: ConversationRecord = {
        ...existing,
        previewText: 'Chat cleared',
        updatedAtMs: Date.now(),
      };
      await db.put('conversations', updatedConv);
      const updatedList = conversations.map((c) => (c.id === normalizedId ? updatedConv : c));
      set({ conversations: updatedList.sort((a, b) => b.updatedAtMs - a.updatedAtMs) });
    }
  },

  deleteConversation: async (convId: string) => {
    const normalizedId = normalizeConvId(convId);
    await get().clearConversationMessages(normalizedId);

    const db = await getDB();
    await db.delete('conversations', normalizedId);

    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== normalizedId),
      messages: state.messages.filter((m) => m.conversation !== normalizedId),
    }));
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

  setIncomingCall: (call: IncomingCallInfo | null) => {
    set({ incomingCall: call });
  },

  loadHistory: async (convId: string) => {
    const normalizedId = normalizeConvId(convId);
    const db = await getDB();
    const all = await db.getAll('messages');
    const convMessages = all
      .filter((m) => m.conversation === normalizedId)
      .sort(sortMessagesByTime);
    set({ messages: convMessages });
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
