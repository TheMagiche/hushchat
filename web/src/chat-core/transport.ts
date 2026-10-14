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

export class MeshTransport {
  private peer: Peer | null = null;
  private anchorPeer: Peer | null = null;
  private connections: Map<string, { conn: DataConnection; session?: WasmSession }> = new Map();
  private calls: Map<string, MediaConnection> = new Map();
  private currentRoomId: string | null = null;
  private roomKeyBytes: Uint8Array | null = null;
  private lamportClock = 0;
  private isAnchor = false;

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
        console.warn('PeerJS error:', err);
        // Do not reject on benign errors
      });
    });
  }

  public async joinRoom(roomId: string, secret?: string) {
    this.currentRoomId = roomId;
    if (secret) {
      const wasm = useChatStore.getState().wasm;
      if (wasm) {
        this.roomKeyBytes = new Uint8Array(wasm.roomKeyFromSecret(secret));
      }
    }

    // Try claiming anchor ID
    const anchorId = `pcr-${roomId.slice(0, 20)}`;
    this.tryClaimAnchor(anchorId);
  }

  private tryClaimAnchor(anchorId: string) {
    const anchor = new Peer(anchorId, {
      host: process.env.NEXT_PUBLIC_PEER_HOST || '0.peerjs.com',
      port: Number(process.env.NEXT_PUBLIC_PEER_PORT) || 443,
      path: process.env.NEXT_PUBLIC_PEER_PATH || '/',
      secure: process.env.NEXT_PUBLIC_PEER_SECURE !== 'false',
    });

    anchor.on('open', () => {
      this.isAnchor = true;
      this.anchorPeer = anchor;
      this.setupAnchorHandlers(anchor);
    });

    anchor.on('error', (_err) => {
      // ID taken -> we are a regular member, connect to anchor
      this.isAnchor = false;
      this.connectToPeer(anchorId);
    });
  }

  private setupAnchorHandlers(anchor: Peer) {
    anchor.on('connection', (conn) => {
      conn.on('open', () => {
        // Send current peer list to newcomer
        const peerList: PeerItem[] = Array.from(useChatStore.getState().peers.values());
        conn.send({ type: 'PeerList', peers: peerList });
      });
    });
  }

  public connectToPeer(targetPeerId: string) {
    if (!this.peer || this.connections.has(targetPeerId)) return;
    const conn = this.peer.connect(targetPeerId, { reliable: true });

    conn.on('open', () => {
      this.connections.set(targetPeerId, { conn });
      // Initiate encrypted handshake
      const wasm = useChatStore.getState().wasm;
      if (wasm) {
        const initRes = wasm.WasmSession.initiateHandshake(
          this.wasmIdentity,
          this.roomKeyBytes || undefined
        ) as { hello: unknown; statePtr: number };

        conn.send({ type: 'Hello', hello: initRes.hello, statePtr: initRes.statePtr });
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingData(targetPeerId, data);
    });

    conn.on('close', () => {
      this.connections.delete(targetPeerId);
    });
  }

  private setupIncomingHandlers() {
    if (!this.peer) return;

    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.connections.set(conn.peer, { conn });
      });

      conn.on('data', (data) => {
        this.handleIncomingData(conn.peer, data);
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
      });
    });

    this.peer.on('call', (mediaConn) => {
      const localStream = useChatStore.getState().localStream;
      if (localStream) {
        mediaConn.answer(localStream);
      } else {
        mediaConn.answer();
      }

      mediaConn.on('stream', (remoteStream) => {
        this.events.onStream?.(mediaConn.peer, remoteStream);
      });
    });
  }

  private handleIncomingData(senderPeerId: string, rawData: unknown) {
    const data = rawData as {
      type?: string;
      hello?: unknown;
      statePtr?: number;
      origStatePtr?: number;
      peers?: PeerItem[];
      ciphertext?: number[];
    };
    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;

    if (data.type === 'PeerList' && data.peers) {
      for (const p of data.peers) {
        if (p.peerjsId !== this.peer?.id) {
          this.connectToPeer(p.peerjsId);
        }
      }
      return;
    }

    if (data.type === 'Hello' && data.hello) {
      const connObj = this.connections.get(senderPeerId);
      if (!connObj) return;

      if (data.statePtr !== undefined) {
        // Responder side
        const resp = wasm.WasmSession.respondHandshake(
          this.wasmIdentity,
          data.hello,
          this.roomKeyBytes || undefined
        ) as { hello: unknown; sessionPtr: number };

        const session = wasm.WasmSession.fromPointer(resp.sessionPtr);
        connObj.session = session;
        connObj.conn.send({ type: 'HelloReply', hello: resp.hello, origStatePtr: data.statePtr });

        const peerItem: PeerItem = {
          userId: session.remoteUserId(),
          peerjsId: senderPeerId,
          name: `Peer-${session.remoteUserId().slice(-4)}`,
          ed25519Pub: new Uint8Array(session.remoteEdPub()),
          isAnchor: false,
        };
        this.events.onPeerJoin?.(peerItem);
      }
      return;
    }

    if (data.type === 'HelloReply' && data.hello && data.origStatePtr !== undefined) {
      const connObj = this.connections.get(senderPeerId);
      if (!connObj) return;

      const session = wasm.WasmSession.completeHandshake(
        this.wasmIdentity,
        data.origStatePtr,
        data.hello,
        this.roomKeyBytes || undefined
      );
      connObj.session = session;

      const peerItem: PeerItem = {
        userId: session.remoteUserId(),
        peerjsId: senderPeerId,
        name: `Peer-${session.remoteUserId().slice(-4)}`,
        ed25519Pub: new Uint8Array(session.remoteEdPub()),
        isAnchor: false,
      };
      this.events.onPeerJoin?.(peerItem);
      return;
    }

    if (data.type === 'Sealed' && data.ciphertext) {
      const connObj = this.connections.get(senderPeerId);
      if (!connObj?.session) return;

      try {
        const frame = connObj.session.openFrame(new Uint8Array(data.ciphertext)) as {
          Msg?: { id: string; conversation: string; author: string; lamport: number; sent_at_ms: number; body: unknown; sig: number[] };
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
          this.events.onTyping?.(connObj.session.remoteUserId(), frame.Typing);
        }
      } catch (err) {
        console.warn('Failed to decrypt incoming frame:', err);
      }
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
        const sealed = connObj.session.sealFrame(frame);
        connObj.conn.send({ type: 'Sealed', ciphertext: Array.from(sealed) });
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

  public sendTyping(isTyping: boolean) {
    const frame = { Typing: isTyping };
    for (const [_, connObj] of this.connections) {
      if (connObj.session) {
        const sealed = connObj.session.sealFrame(frame);
        connObj.conn.send({ type: 'Sealed', ciphertext: Array.from(sealed) });
      }
    }
  }

  public callPeer(targetPeerId: string, stream: MediaStream) {
    if (!this.peer) return;
    const call = this.peer.call(targetPeerId, stream);
    this.calls.set(targetPeerId, call);

    call.on('stream', (remoteStream) => {
      this.events.onStream?.(targetPeerId, remoteStream);
    });
  }

  public close() {
    this.connections.forEach((c) => c.conn.close());
    this.connections.clear();
    this.calls.forEach((c) => c.close());
    this.calls.clear();
    this.peer?.destroy();
    this.anchorPeer?.destroy();
  }
}
