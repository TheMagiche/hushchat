import type { DataConnection, MediaConnection } from 'peerjs';
import { WasmSession, WasmIdentity } from '../wasm/pkg/peerchat_wasm';
import { useChatStore, PeerItem } from '../state/store';
import { MessageRecord } from '../db/schema';

export interface TransportEvents {
  onMessage?: (msg: MessageRecord) => void;
  onPeerJoin?: (peer: PeerItem) => void;
  onPeerLeave?: (userId: string) => void;
  onTyping?: (userId: string, isTyping: boolean) => void;
  onStream?: (peerId: string, stream: MediaStream) => void;
  onIncomingCall?: (callerPeerId: string, callerUserId?: string, callerName?: string, mediaConn?: any) => void;
  onCallEnded?: () => void;
}

interface ConnectionEntry {
  conn: DataConnection;
  session?: WasmSession;
  userId?: string;
  name?: string;
}

interface AnchorMember {
  peerId: string;
  userId: string;
  name: string;
}

async function getPeerConstructor(): Promise<any> {
  if (typeof window === 'undefined') {
    return null;
  }
  const mod: any = await import('peerjs');
  if (typeof mod === 'function') return mod;
  if (typeof mod.default === 'function') return mod.default;
  if (typeof mod.Peer === 'function') return mod.Peer;
  if (typeof mod.default?.default === 'function') return mod.default.default;
  if (typeof mod.default?.Peer === 'function') return mod.default.Peer;
  return mod.default || mod;
}

function toUint8Array(val: any): Uint8Array {
  if (!val) return new Uint8Array(0);
  if (val instanceof Uint8Array) return val;
  if (val instanceof ArrayBuffer) return new Uint8Array(val);
  if (ArrayBuffer.isView(val)) return new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
  if (Array.isArray(val)) return new Uint8Array(val);
  if (typeof val === 'object') return new Uint8Array(Object.values(val));
  return new Uint8Array(0);
}

function hashChannelId(id: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h1 ^= id.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  let h2 = 0x84222325;
  for (let i = 0; i < id.length; i++) {
    h2 ^= (id.charCodeAt(i) * 31);
    h2 = Math.imul(h2, 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}`;
}

export class MeshTransport {
  private peer: any = null;
  private anchorPeer: any = null;
  private anchorConn: DataConnection | null = null;
  private anchorMembers: Map<string, AnchorMember> = new Map();
  private anchorConns: Set<DataConnection> = new Set();
  private connections: Map<string, ConnectionEntry> = new Map();
  private calls: Map<string, MediaConnection> = new Map();
  private pendingIncomingCalls: Map<string, any> = new Map();
  private chunkedIncoming: Map<string, { chunks: Uint8Array[]; received: number; total: number }> = new Map();
  private connectFallbacks: Map<string, NodeJS.Timeout> = new Map();
  private currentRoomId: string | null = null;
  private roomKeyBytes: Uint8Array | null = null;
  private lamportClock = 0;
  private isAnchor = false;
  private isDestroyed = false;

  constructor(
    private wasmIdentity: WasmIdentity,
    private profileName: string,
    private events: TransportEvents
  ) {}

  public async init(peerjsId: string): Promise<string> {
    if (typeof window === 'undefined') return '';
    const PeerClass = await getPeerConstructor();
    if (!PeerClass) return '';

    return new Promise((resolve) => {
      const p: any = new PeerClass(peerjsId, {
        host: process.env.NEXT_PUBLIC_PEER_HOST || '0.peerjs.com',
        port: Number(process.env.NEXT_PUBLIC_PEER_PORT) || 443,
        path: process.env.NEXT_PUBLIC_PEER_PATH || '/',
        secure: process.env.NEXT_PUBLIC_PEER_SECURE !== 'false',
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      p.on('open', (id: string) => {
        this.peer = p;
        this.setupIncomingHandlers();
        resolve(id);
      });

      p.on('error', (err: any) => {
        console.warn('PeerJS main instance error:', err);
      });
    });
  }

  public async joinRoom(roomId: string, secret?: string) {
    if (this.isDestroyed) return;
    this.currentRoomId = roomId;

    if (secret) {
      const wasm = useChatStore.getState().wasm;
      if (wasm) {
        try {
          this.roomKeyBytes = new Uint8Array(wasm.roomKeyFromSecret(secret));
        } catch (e) {
          console.warn('Failed to derive room key from secret:', e);
        }
      }
    }

    let anchorId: string;
    if (roomId.startsWith('dm-')) {
      anchorId = `pcr-dm-${hashChannelId(roomId)}`;
    } else {
      const sanitized = roomId.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 24);
      anchorId = `pcr-${sanitized}`;
    }
    this.tryClaimAnchor(anchorId);
  }

  private async tryClaimAnchor(anchorId: string) {
    if (this.isDestroyed || !this.peer || typeof window === 'undefined') return;

    const PeerClass = await getPeerConstructor();
    if (!PeerClass) return;

    const anchor: any = new PeerClass(anchorId, {
      host: process.env.NEXT_PUBLIC_PEER_HOST || '0.peerjs.com',
      port: Number(process.env.NEXT_PUBLIC_PEER_PORT) || 443,
      path: process.env.NEXT_PUBLIC_PEER_PATH || '/',
      secure: process.env.NEXT_PUBLIC_PEER_SECURE !== 'false',
    });

    anchor.on('open', () => {
      if (this.isDestroyed) {
        anchor.destroy();
        return;
      }
      this.isAnchor = true;
      this.anchorPeer = anchor;
      if (this.peer) {
        this.anchorMembers.set(this.peer.id, {
          peerId: this.peer.id,
          userId: this.wasmIdentity.userId(),
          name: this.profileName,
        });
      }
      this.setupAnchorHandlers(anchor);
    });

    anchor.on('error', (_err: any) => {
      // Anchor ID taken -> another peer is anchor; connect as regular room member
      if (this.isDestroyed) return;
      this.isAnchor = false;
      this.connectToAnchor(anchorId);
    });
  }

  private setupAnchorHandlers(anchor: any) {
    anchor.on('connection', (conn: DataConnection) => {
      this.anchorConns.add(conn);

      conn.on('data', (raw: any) => {
        if (raw?.type === 'RoomJoin') {
          const { peerId, userId, name } = raw;
          if (!peerId) return;

          // 1. Send all currently known members to the newcomer
          const membersList = Array.from(this.anchorMembers.values());
          conn.send({
            type: 'RoomMembers',
            members: membersList,
          });

          // 2. Broadcast the newcomer to all existing members via their anchor connections
          const newMember: AnchorMember = {
            peerId,
            userId: userId || `Peer-${peerId.slice(-4)}`,
            name: name || `Peer-${peerId.slice(-4)}`,
          };

          for (const c of this.anchorConns) {
            if (c !== conn && c.open) {
              c.send({
                type: 'RoomMemberJoined',
                member: newMember,
              });
            }
          }

          // 3. Register newcomer in anchor directory
          this.anchorMembers.set(peerId, newMember);

          // 4. Connect to newcomer with deterministic tie-breaker
          if (this.peer && peerId !== this.peer.id) {
            this.connectToPeer(peerId, name);
          }
        }
      });

      conn.on('close', () => {
        this.anchorConns.delete(conn);
        const leftPeerId = conn.peer;
        if (leftPeerId && this.anchorMembers.has(leftPeerId)) {
          this.anchorMembers.delete(leftPeerId);
          for (const c of this.anchorConns) {
            if (c.open) {
              c.send({
                type: 'RoomMemberLeft',
                peerId: leftPeerId,
              });
            }
          }
        }
      });
    });
  }

  private connectToAnchor(anchorId: string) {
    if (!this.peer || this.isDestroyed) return;

    const anchorConn = this.peer.connect(anchorId, { reliable: true });
    this.anchorConn = anchorConn;

    anchorConn.on('open', () => {
      anchorConn.send({
        type: 'RoomJoin',
        peerId: this.peer?.id,
        userId: this.wasmIdentity.userId(),
        name: this.profileName,
      });
    });

    anchorConn.on('data', (data: any) => {
      if (data?.type === 'RoomMembers' && Array.isArray(data.members)) {
        for (const member of data.members) {
          if (member.peerId && member.peerId !== this.peer?.id) {
            this.connectToPeer(member.peerId, member.name);
          }
        }
      } else if (data?.type === 'RoomMemberJoined' && data.member) {
        if (data.member.peerId && data.member.peerId !== this.peer?.id) {
          this.connectToPeer(data.member.peerId, data.member.name);
        }
      } else if (data?.type === 'RoomMemberLeft' && data.peerId) {
        // Disconnect will also be caught by direct DataChannel close
      }
    });

    anchorConn.on('close', () => {
      this.anchorConn = null;
      if (!this.isDestroyed && this.currentRoomId) {
        setTimeout(() => {
          if (!this.isDestroyed && this.currentRoomId) {
            this.tryClaimAnchor(anchorId);
          }
        }, 1200);
      }
    });
  }

  public connectToPeer(targetPeerId: string, expectedName?: string) {
    if (!this.peer || this.isDestroyed) return;
    if (targetPeerId === this.peer.id) return;
    if (this.connections.has(targetPeerId)) return;

    // Tie-breaker: peer with lexicographically higher peer ID initiates outbound DataConnection
    const shouldInitiate = this.peer.id > targetPeerId;
    if (!shouldInitiate) {
      // Remote peer will initiate connection; set fallback timer in case remote doesn't initiate
      if (!this.connectFallbacks.has(targetPeerId)) {
        const timer = setTimeout(() => {
          this.connectFallbacks.delete(targetPeerId);
          if (!this.isDestroyed && this.peer && !this.connections.has(targetPeerId)) {
            this.forceInitiatePeerConnection(targetPeerId, expectedName);
          }
        }, 3000);
        this.connectFallbacks.set(targetPeerId, timer);
      }
      return;
    }

    this.forceInitiatePeerConnection(targetPeerId, expectedName);
  }

  private forceInitiatePeerConnection(targetPeerId: string, expectedName?: string) {
    if (!this.peer || this.isDestroyed) return;
    if (this.connections.has(targetPeerId)) return;

    const timer = this.connectFallbacks.get(targetPeerId);
    if (timer) {
      clearTimeout(timer);
      this.connectFallbacks.delete(targetPeerId);
    }

    const conn = this.peer.connect(targetPeerId, { reliable: true });
    this.connections.set(targetPeerId, { conn, name: expectedName });

    conn.on('open', () => {
      const wasm = useChatStore.getState().wasm;
      if (wasm) {
        try {
          const initRes = wasm.WasmSession.initiateHandshake(
            this.wasmIdentity,
            this.roomKeyBytes || undefined
          ) as { hello: unknown; statePtr: number };

          conn.send({
            type: 'Hello',
            hello: initRes.hello,
            statePtr: initRes.statePtr,
            profile: { name: this.profileName },
          });
        } catch (err) {
          console.warn('Failed to initiate handshake with peer:', err);
        }
      }
    });

    conn.on('data', (data: any) => {
      this.handleIncomingData(targetPeerId, data, conn);
    });

    conn.on('close', () => {
      this.handlePeerDisconnect(targetPeerId);
    });

    conn.on('error', (err: any) => {
      console.warn('Connection error with peer', targetPeerId, err);
      this.handlePeerDisconnect(targetPeerId);
    });
  }

  private setupIncomingHandlers() {
    if (!this.peer) return;

    this.peer.on('connection', (incomingConn: any) => {
      const remotePeerId = incomingConn.peer;
      const existing = this.connections.get(remotePeerId);

      // Handle connection glare: if an open session already exists on our connection
      if (existing?.session && existing.conn?.open) {
        if (this.peer && this.peer.id > remotePeerId) {
          // Authoritative outbound connection wins
          try {
            incomingConn.close();
          } catch (e) {}
          return;
        } else {
          // Authoritative inbound connection wins
          try {
            existing.conn.close();
          } catch (e) {}
        }
      }

      this.connections.set(remotePeerId, { conn: incomingConn });

      incomingConn.on('data', (data: any) => {
        this.handleIncomingData(remotePeerId, data, incomingConn);
      });

      incomingConn.on('close', () => {
        this.handlePeerDisconnect(remotePeerId);
      });

      incomingConn.on('error', (err: any) => {
        console.warn('Incoming peer connection error:', err);
        this.handlePeerDisconnect(remotePeerId);
      });
    });

    this.peer.on('call', (mediaConn: any) => {
      const localStream = useChatStore.getState().localStream;
      const connObj = this.connections.get(mediaConn.peer);
      const callerName = connObj?.name || `Peer-${mediaConn.peer.slice(-4)}`;
      const callerUserId = connObj?.userId;

      this.pendingIncomingCalls.set(mediaConn.peer, mediaConn);

      if (localStream && useChatStore.getState().callActive) {
        mediaConn.answer(localStream);
        this.calls.set(mediaConn.peer, mediaConn);

        mediaConn.on('stream', (remoteStream: MediaStream) => {
          this.events.onStream?.(mediaConn.peer, remoteStream);
        });

        mediaConn.on('close', () => {
          this.calls.delete(mediaConn.peer);
        });
      } else {
        // Occupant is not yet in call -> notify with incoming call banner
        this.events.onIncomingCall?.(mediaConn.peer, callerUserId, callerName, mediaConn);

        mediaConn.on('stream', (remoteStream: MediaStream) => {
          this.events.onStream?.(mediaConn.peer, remoteStream);
        });

        mediaConn.on('close', () => {
          this.pendingIncomingCalls.delete(mediaConn.peer);
          this.calls.delete(mediaConn.peer);
        });
      }
    });
  }

  private handleIncomingData(senderPeerId: string, rawData: unknown, conn: DataConnection) {
    const data = rawData as {
      type?: string;
      hello?: unknown;
      statePtr?: number;
      origStatePtr?: number;
      profile?: { name?: string };
      ciphertext?: number[] | Uint8Array;
      transferId?: string;
      index?: number;
      total?: number;
      data?: number[] | Uint8Array;
      callerUserId?: string;
      callerName?: string;
      callerPeerId?: string;
    };

    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;

    if (data.type === 'CallOffer') {
      const connObj = this.connections.get(senderPeerId);
      const callerName = data.callerName || connObj?.name || `Peer-${senderPeerId.slice(-4)}`;
      const callerUserId = data.callerUserId || connObj?.userId;
      const mediaConn = this.pendingIncomingCalls.get(senderPeerId);
      if (!useChatStore.getState().callActive) {
        this.events.onIncomingCall?.(senderPeerId, callerUserId, callerName, mediaConn);
      }
      return;
    }

    if (data.type === 'CallEnd') {
      this.events.onCallEnded?.();
      return;
    }

    if (data.type === 'Hello' && data.hello) {
      if (data.statePtr !== undefined) {
        try {
          const resp = wasm.WasmSession.respondHandshake(
            this.wasmIdentity,
            data.hello,
            this.roomKeyBytes || undefined
          ) as { hello: unknown; sessionPtr: number };

          const session = wasm.WasmSession.fromPointer(resp.sessionPtr);
          const remoteUserId = session.remoteUserId();
          const remoteName = data.profile?.name || `Peer-${remoteUserId.slice(-4)}`;
          const remoteEdPub = new Uint8Array(session.remoteEdPub());

          this.connections.set(senderPeerId, {
            conn,
            session,
            userId: remoteUserId,
            name: remoteName,
          });

          conn.send({
            type: 'HelloReply',
            hello: resp.hello,
            origStatePtr: data.statePtr,
            profile: { name: this.profileName },
          });

          useChatStore.getState().updateContactProfile(remoteUserId, remoteName, remoteEdPub);

          const peerItem: PeerItem = {
            userId: remoteUserId,
            peerjsId: senderPeerId,
            name: remoteName,
            ed25519Pub: remoteEdPub,
            isAnchor: false,
          };
          this.events.onPeerJoin?.(peerItem);
        } catch (err) {
          console.warn('Responder handshake verification failed:', err);
        }
      }
      return;
    }

    if (data.type === 'HelloReply' && data.hello && data.origStatePtr !== undefined) {
      const connObj = this.connections.get(senderPeerId) || { conn };

      try {
        const session = wasm.WasmSession.completeHandshake(
          this.wasmIdentity,
          data.origStatePtr,
          data.hello,
          this.roomKeyBytes || undefined
        );

        const remoteUserId = session.remoteUserId();
        const remoteName = data.profile?.name || connObj.name || `Peer-${remoteUserId.slice(-4)}`;
        const remoteEdPub = new Uint8Array(session.remoteEdPub());

        this.connections.set(senderPeerId, {
          conn,
          session,
          userId: remoteUserId,
          name: remoteName,
        });

        useChatStore.getState().updateContactProfile(remoteUserId, remoteName, remoteEdPub);

        const peerItem: PeerItem = {
          userId: remoteUserId,
          peerjsId: senderPeerId,
          name: remoteName,
          ed25519Pub: remoteEdPub,
          isAnchor: false,
        };
        this.events.onPeerJoin?.(peerItem);
      } catch (err) {
        console.warn('Initiator handshake completion failed:', err);
      }
      return;
    }

    if (data.type === 'SealedChunk' && data.transferId && data.data && data.total !== undefined && data.index !== undefined) {
      const { transferId, index, total, data: chunkData } = data;
      const chunkBytes = toUint8Array(chunkData);
      let entry = this.chunkedIncoming.get(transferId);
      if (!entry) {
        entry = { chunks: new Array(total), received: 0, total };
        this.chunkedIncoming.set(transferId, entry);
        setTimeout(() => {
          if (this.chunkedIncoming.has(transferId)) {
            this.chunkedIncoming.delete(transferId);
          }
        }, 30000);
      }
      if (!entry.chunks[index]) {
        entry.chunks[index] = chunkBytes;
        entry.received += 1;
      }
      if (entry.received === entry.total) {
        this.chunkedIncoming.delete(transferId);
        const fullLength = entry.chunks.reduce((acc, c) => acc + (c?.length || 0), 0);
        const assembled = new Uint8Array(fullLength);
        let offset = 0;
        for (const chunk of entry.chunks) {
          if (chunk) {
            assembled.set(chunk, offset);
            offset += chunk.length;
          }
        }
        this.processSealedCiphertext(senderPeerId, assembled);
      }
      return;
    }

    if (data.type === 'Sealed' && data.ciphertext) {
      this.processSealedCiphertext(senderPeerId, toUint8Array(data.ciphertext));
      return;
    }
  }

  private processSealedCiphertext(senderPeerId: string, ciphertext: Uint8Array) {
    const connObj = this.connections.get(senderPeerId);
    if (!connObj?.session) return;

    try {
      const frame = connObj.session.openFrame(ciphertext) as {
        Msg?: {
          id: string;
          conversation: string;
          author: string;
          lamport: number;
          sent_at_ms: number;
          body: unknown;
          sig: number[];
        };
        Profile?: {
          name: string;
          avatar_hash?: unknown;
        };
        Typing?: boolean;
      };

      if (frame.Msg) {
        this.lamportClock = Math.max(this.lamportClock, frame.Msg.lamport) + 1;
        const bodyObj = frame.Msg.body as { Delete?: { target: string } };
        if (bodyObj?.Delete?.target) {
          useChatStore.getState().deleteMessage(bodyObj.Delete.target, frame.Msg.conversation);
          return;
        }

        const msgRecord: MessageRecord = {
          id: frame.Msg.id,
          conversation: frame.Msg.conversation,
          author: frame.Msg.author,
          lamport: frame.Msg.lamport,
          sentAtMs: frame.Msg.sent_at_ms,
          body: frame.Msg.body,
          sig: new Uint8Array(frame.Msg.sig),
          isDelivered: true,
        };
        this.events.onMessage?.(msgRecord);
      }

      if (frame.Profile && frame.Profile.name) {
        const remoteUserId = connObj.userId || connObj.session.remoteUserId();
        const updatedName = frame.Profile.name;
        connObj.name = updatedName;
        const remoteEdPub = new Uint8Array(connObj.session.remoteEdPub());

        useChatStore.getState().updateContactProfile(remoteUserId, updatedName, remoteEdPub);

        this.events.onPeerJoin?.({
          userId: remoteUserId,
          peerjsId: senderPeerId,
          name: updatedName,
          ed25519Pub: remoteEdPub,
          isAnchor: false,
        });
      }

      if (frame.Typing !== undefined) {
        this.events.onTyping?.(connObj.userId || connObj.session.remoteUserId(), frame.Typing);
      }
    } catch (err) {
      console.warn('Failed to decrypt incoming frame:', err);
    }
  }

  private async sendSealedFrame(frame: any) {
    for (const [_, connObj] of this.connections) {
      if (connObj.session && connObj.conn?.open) {
        try {
          const sealed: Uint8Array = connObj.session.sealFrame(frame);
          const CHUNK_SIZE = 16384; // 16 KB chunks for reliable WebRTC data transfer
          if (sealed.length <= CHUNK_SIZE) {
            connObj.conn.send({ type: 'Sealed', ciphertext: sealed });
          } else {
            const transferId = `tf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const totalChunks = Math.ceil(sealed.length / CHUNK_SIZE);
            for (let i = 0; i < totalChunks; i++) {
              const chunkData = sealed.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, sealed.length));
              connObj.conn.send({
                type: 'SealedChunk',
                transferId,
                index: i,
                total: totalChunks,
                data: chunkData,
              });
              if (i % 6 === 0 && totalChunks > 6) {
                await new Promise((r) => setTimeout(r, 4));
              }
            }
          }
        } catch (e) {
          console.warn('Failed to seal frame for peer:', e);
        }
      }
    }
  }

  public broadcastProfile(name: string) {
    this.profileName = name;
    this.sendSealedFrame({ Profile: { name, avatar_hash: null } });
  }

  public broadcastCallState(active: boolean) {
    for (const [_, connObj] of this.connections) {
      if (connObj.conn?.open) {
        connObj.conn.send({
          type: active ? 'CallOffer' : 'CallEnd',
          callerUserId: this.wasmIdentity.userId(),
          callerName: this.profileName,
          callerPeerId: this.peer?.id,
        });
      }
    }
  }

  public callAllPeers(stream: MediaStream) {
    if (!this.peer || this.isDestroyed) return;
    for (const [peerId, connObj] of this.connections) {
      this.callPeer(peerId, stream);
    }
    for (const [peerId, mediaConn] of this.pendingIncomingCalls) {
      try {
        mediaConn.answer(stream);
        this.calls.set(peerId, mediaConn);
      } catch (e) {
        // ignore
      }
    }
    this.pendingIncomingCalls.clear();
    this.broadcastCallState(true);
  }

  private handlePeerDisconnect(peerId: string) {
    const connObj = this.connections.get(peerId);
    if (connObj) {
      if (connObj.userId) {
        this.events.onPeerLeave?.(connObj.userId);
      }
      this.connections.delete(peerId);
    }
    const call = this.calls.get(peerId);
    if (call) {
      call.close();
      this.calls.delete(peerId);
    }
    this.pendingIncomingCalls.delete(peerId);
  }

  public async broadcastTextMessage(conversation: string, text: string) {
    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;

    this.lamportClock += 1;
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const signedMsg = wasm.createMessage(
      this.wasmIdentity,
      msgId,
      conversation,
      this.wasmIdentity.userId(),
      this.lamportClock,
      now,
      { Text: { markdown: text } }
    ) as { id: string; conversation: string; author: string; lamport: number; sent_at_ms: number; body: unknown; sig: number[] };

    this.sendSealedFrame({ Msg: signedMsg });

    const localMsg: MessageRecord = {
      id: msgId,
      conversation,
      author: this.wasmIdentity.userId(),
      lamport: this.lamportClock,
      sentAtMs: now,
      body: { Text: { markdown: text } },
      sig: new Uint8Array(signedMsg.sig),
      isDelivered: true,
    };

    this.events.onMessage?.(localMsg);
  }

  public async broadcastFileMessage(
    conversation: string,
    file: { name: string; size: number; mime: string; dataUrl: string; manifestId?: string }
  ) {
    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;

    this.lamportClock += 1;
    const msgId = `msg-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const manifestId = file.manifestId || `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fileBody = {
      File: {
        manifest_id: manifestId,
        name: file.name,
        size: file.size,
        mime: file.mime,
        data_url: file.dataUrl,
      },
    };

    const signedMsg = wasm.createMessage(
      this.wasmIdentity,
      msgId,
      conversation,
      this.wasmIdentity.userId(),
      this.lamportClock,
      now,
      fileBody
    ) as { id: string; conversation: string; author: string; lamport: number; sent_at_ms: number; body: unknown; sig: number[] };

    this.sendSealedFrame({ Msg: signedMsg });

    const localMsg: MessageRecord = {
      id: msgId,
      conversation,
      author: this.wasmIdentity.userId(),
      lamport: this.lamportClock,
      sentAtMs: now,
      body: fileBody,
      sig: new Uint8Array(signedMsg.sig),
      isDelivered: true,
    };

    this.events.onMessage?.(localMsg);
  }

  public async broadcastDeleteMessage(conversation: string, targetMsgId: string) {
    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;

    this.lamportClock += 1;
    const msgId = `msg-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const deleteBody = {
      Delete: {
        target: targetMsgId,
      },
    };

    const signedMsg = wasm.createMessage(
      this.wasmIdentity,
      msgId,
      conversation,
      this.wasmIdentity.userId(),
      this.lamportClock,
      now,
      deleteBody
    ) as { id: string; conversation: string; author: string; lamport: number; sent_at_ms: number; body: unknown; sig: number[] };

    this.sendSealedFrame({ Msg: signedMsg });
    await useChatStore.getState().deleteMessage(targetMsgId, conversation);
  }

  public sendTyping(isTyping: boolean) {
    this.sendSealedFrame({ Typing: isTyping });
  }

  public callPeer(targetPeerId: string, stream: MediaStream) {
    if (!this.peer || this.isDestroyed) return;
    const call = this.peer.call(targetPeerId, stream);
    this.calls.set(targetPeerId, call);

    call.on('stream', (remoteStream: MediaStream) => {
      this.events.onStream?.(targetPeerId, remoteStream);
    });

    call.on('close', () => {
      this.calls.delete(targetPeerId);
    });
  }

  public close() {
    this.isDestroyed = true;
    for (const [_, timer] of this.connectFallbacks) {
      clearTimeout(timer);
    }
    this.connectFallbacks.clear();
    this.connections.forEach((c) => c.conn.close());
    this.connections.clear();
    this.calls.forEach((c) => c.close());
    this.calls.clear();
    this.pendingIncomingCalls.clear();
    this.chunkedIncoming.clear();
    this.anchorConn?.close();
    this.anchorConn = null;
    this.anchorConns.forEach((c) => c.close());
    this.anchorConns.clear();
    this.anchorMembers.clear();
    this.peer?.destroy();
    this.peer = null;
    this.anchorPeer?.destroy();
    this.anchorPeer = null;
  }
}
