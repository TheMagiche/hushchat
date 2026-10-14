import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { WasmSession, WasmIdentity } from '../wasm/pkg/peerchat_wasm';
import { useChatStore, PeerItem } from '../state/store';
import { MessageRecord } from '../db/schema';

export interface TransportEvents {
  onMessage?: (msg: MessageRecord) => void;
  onPeerJoin?: (peer: PeerItem) => void;
  onPeerLeave?: (userId: string) => void;
  onTyping?: (userId: string, isTyping: boolean) => void;
  onStream?: (peerId: string, stream: MediaStream) => void;
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

export class MeshTransport {
  private peer: Peer | null = null;
  private anchorPeer: Peer | null = null;
  private anchorConn: DataConnection | null = null;
  private anchorMembers: Map<string, AnchorMember> = new Map();
  private anchorConns: Set<DataConnection> = new Set();
  private connections: Map<string, ConnectionEntry> = new Map();
  private calls: Map<string, MediaConnection> = new Map();
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
    return new Promise((resolve, reject) => {
      const p = new Peer(peerjsId, {
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

      p.on('open', (id) => {
        this.peer = p;
        this.setupIncomingHandlers();
        resolve(id);
      });

      p.on('error', (err) => {
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

    const sanitized = roomId.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 24);
    const anchorId = `pcr-${sanitized}`;
    this.tryClaimAnchor(anchorId);
  }

  private tryClaimAnchor(anchorId: string) {
    if (this.isDestroyed || !this.peer) return;

    const anchor = new Peer(anchorId, {
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

    anchor.on('error', (_err) => {
      // Anchor ID taken -> another peer is anchor; connect as regular room member
      if (this.isDestroyed) return;
      this.isAnchor = false;
      this.connectToAnchor(anchorId);
    });
  }

  private setupAnchorHandlers(anchor: Peer) {
    anchor.on('connection', (conn) => {
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

          // 4. Anchor holder's main peer connects directly to newcomer
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
      // If anchor disconnected and room is still active, try to claim anchor position
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

    const conn = this.peer.connect(targetPeerId, { reliable: true });
    this.connections.set(targetPeerId, { conn, name: expectedName });

    conn.on('open', () => {
      // Initiator begins cryptographic Triple-DH handshake
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

    conn.on('data', (data) => {
      this.handleIncomingData(targetPeerId, data, conn);
    });

    conn.on('close', () => {
      this.handlePeerDisconnect(targetPeerId);
    });

    conn.on('error', (err) => {
      console.warn('Connection error with peer', targetPeerId, err);
      this.handlePeerDisconnect(targetPeerId);
    });
  }

  private setupIncomingHandlers() {
    if (!this.peer) return;

    this.peer.on('connection', (conn) => {
      if (!this.connections.has(conn.peer)) {
        this.connections.set(conn.peer, { conn });
      }

      conn.on('data', (data) => {
        this.handleIncomingData(conn.peer, data, conn);
      });

      conn.on('close', () => {
        this.handlePeerDisconnect(conn.peer);
      });

      conn.on('error', (err) => {
        console.warn('Incoming peer connection error:', err);
        this.handlePeerDisconnect(conn.peer);
      });
    });

    this.peer.on('call', (mediaConn) => {
      const localStream = useChatStore.getState().localStream;
      if (localStream) {
        mediaConn.answer(localStream);
      } else {
        mediaConn.answer();
      }

      this.calls.set(mediaConn.peer, mediaConn);

      mediaConn.on('stream', (remoteStream) => {
        this.events.onStream?.(mediaConn.peer, remoteStream);
      });

      mediaConn.on('close', () => {
        this.calls.delete(mediaConn.peer);
      });
    });
  }

  private handleIncomingData(senderPeerId: string, rawData: unknown, conn: DataConnection) {
    const data = rawData as {
      type?: string;
      hello?: unknown;
      statePtr?: number;
      origStatePtr?: number;
      profile?: { name?: string };
      ciphertext?: number[];
    };

    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;

    if (data.type === 'Hello' && data.hello) {
      if (data.statePtr !== undefined) {
        // Responder side
        try {
          const resp = wasm.WasmSession.respondHandshake(
            this.wasmIdentity,
            data.hello,
            this.roomKeyBytes || undefined
          ) as { hello: unknown; sessionPtr: number };

          const session = wasm.WasmSession.fromPointer(resp.sessionPtr);
          const remoteUserId = session.remoteUserId();
          const remoteName = data.profile?.name || `Peer-${remoteUserId.slice(-4)}`;

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

          const peerItem: PeerItem = {
            userId: remoteUserId,
            peerjsId: senderPeerId,
            name: remoteName,
            ed25519Pub: new Uint8Array(session.remoteEdPub()),
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

        this.connections.set(senderPeerId, {
          conn,
          session,
          userId: remoteUserId,
          name: remoteName,
        });

        const peerItem: PeerItem = {
          userId: remoteUserId,
          peerjsId: senderPeerId,
          name: remoteName,
          ed25519Pub: new Uint8Array(session.remoteEdPub()),
          isAnchor: false,
        };
        this.events.onPeerJoin?.(peerItem);
      } catch (err) {
        console.warn('Initiator handshake completion failed:', err);
      }
      return;
    }

    if (data.type === 'Sealed' && data.ciphertext) {
      const connObj = this.connections.get(senderPeerId);
      if (!connObj?.session) return;

      try {
        const frame = connObj.session.openFrame(new Uint8Array(data.ciphertext)) as {
          Msg?: {
            id: string;
            conversation: string;
            author: string;
            lamport: number;
            sent_at_ms: number;
            body: unknown;
            sig: number[];
          };
          Typing?: boolean;
        };

        if (frame.Msg) {
          this.lamportClock = Math.max(this.lamportClock, frame.Msg.lamport) + 1;
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

        if (frame.Typing !== undefined) {
          this.events.onTyping?.(connObj.userId || connObj.session.remoteUserId(), frame.Typing);
        }
      } catch (err) {
        console.warn('Failed to decrypt incoming frame:', err);
      }
    }
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

    const frame = { Msg: signedMsg };

    // Broadcast sealed frame to all active sessions
    for (const [_, connObj] of this.connections) {
      if (connObj.session) {
        try {
          const sealed = connObj.session.sealFrame(frame);
          connObj.conn.send({ type: 'Sealed', ciphertext: Array.from(sealed) });
        } catch (e) {
          console.warn('Failed to seal message frame for peer:', e);
        }
      }
    }

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

    const frame = { Msg: signedMsg };

    for (const [_, connObj] of this.connections) {
      if (connObj.session) {
        try {
          const sealed = connObj.session.sealFrame(frame);
          connObj.conn.send({ type: 'Sealed', ciphertext: Array.from(sealed) });
        } catch (e) {
          console.warn('Failed to seal file frame for peer:', e);
        }
      }
    }

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

  public sendTyping(isTyping: boolean) {
    const frame = { Typing: isTyping };
    for (const [_, connObj] of this.connections) {
      if (connObj.session) {
        try {
          const sealed = connObj.session.sealFrame(frame);
          connObj.conn.send({ type: 'Sealed', ciphertext: Array.from(sealed) });
        } catch (e) {
          // ignore
        }
      }
    }
  }

  public callPeer(targetPeerId: string, stream: MediaStream) {
    if (!this.peer || this.isDestroyed) return;
    const call = this.peer.call(targetPeerId, stream);
    this.calls.set(targetPeerId, call);

    call.on('stream', (remoteStream) => {
      this.events.onStream?.(targetPeerId, remoteStream);
    });

    call.on('close', () => {
      this.calls.delete(targetPeerId);
    });
  }

  public close() {
    this.isDestroyed = true;
    this.connections.forEach((c) => c.conn.close());
    this.connections.clear();
    this.calls.forEach((c) => c.close());
    this.calls.clear();
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
