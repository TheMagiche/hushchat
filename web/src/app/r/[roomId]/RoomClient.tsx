'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChatStore } from '@/state/store';
import { MeshTransport } from '@/chat-core/transport';
import { MessageList } from '@/components/MessageList';
import { Composer } from '@/components/Composer';
import { PeerList } from '@/components/PeerList';
import { CallGrid } from '@/components/CallGrid';
import {
  Shield,
  Phone,
  Share2,
  Lock,
  ArrowLeft,
  Copy,
  Check,
  QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function RoomClient() {
  const params = useParams();
  const router = useRouter();
  const roomId = (params?.roomId as string) || 'general';
  const {
    identity,
    wasm,
    messages,
    peers,
    typingUsers,
    callActive,
    localStream,
    remoteStreams,
    micEnabled,
    cameraEnabled,
    addMessage,
    addPeer,
    removePeer,
    setTyping,
    toggleMic,
    toggleCamera,
    toggleScreen,
    initApp,
    loadHistory,
  } = useChatStore();

  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [secretKey, setSecretKey] = useState<string | undefined>(undefined);
  const transportRef = useRef<MeshTransport | null>(null);

  useEffect(() => {
    initApp();
  }, [initApp]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('k=')) {
      const match = window.location.hash.match(/k=([^&]+)/);
      if (match) {
        setSecretKey(match[1]);
      }
    }
  }, []);

  useEffect(() => {
    if (!wasm || !identity) return;

    loadHistory(`room:${roomId}`);

    const wasmId = new wasm.WasmIdentity();
    const peerjsId = wasmId.generatePeerjsId();

    const transport = new MeshTransport(wasmId, identity.profileName, {
      onMessage: (msg) => {
        addMessage(msg);
      },
      onPeerJoin: (peer) => {
        addPeer(peer);
      },
      onPeerLeave: (uid) => {
        removePeer(uid);
      },
      onTyping: (uid, isTyping) => {
        setTyping(uid, isTyping);
      },
      onStream: (peerId, stream) => {
        useChatStore.setState((s) => {
          const next = new Map(s.remoteStreams);
          next.set(peerId, stream);
          return { remoteStreams: next };
        });
      },
    });

    transportRef.current = transport;

    transport.init(peerjsId).then(() => {
      transport.joinRoom(roomId, secretKey);
    });

    return () => {
      transport.close();
    };
  }, [wasm, identity, roomId, secretKey, addMessage, addPeer, removePeer, setTyping, loadHistory]);

  const handleSendMessage = (text: string) => {
    transportRef.current?.broadcastTextMessage(`room:${roomId}`, text);
  };

  const handleTyping = (isTyping: boolean) => {
    transportRef.current?.sendTyping(isTyping);
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      useChatStore.setState({ callActive: true, localStream: stream });

      for (const peer of peers.values()) {
        transportRef.current?.callPeer(peer.peerjsId, stream);
      }
    } catch (err) {
      console.warn('Failed to start call:', err);
    }
  };

  const hangupCall = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    useChatStore.setState({ callActive: false, localStream: null, remoteStreams: new Map() });
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Navbar */}
      <div className="p-3 bg-card border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-sm">#{roomId}</h2>
              {secretKey ? (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                  <Lock className="w-3 h-3" /> Secret Keyed
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Public Room
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {peers.size + 1} connected peer{peers.size !== 0 ? 's' : ''} • Ephemeral mesh
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!callActive ? (
            <button
              onClick={startCall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-accent text-xs font-medium text-foreground transition-colors border border-border"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" /> Start Call
            </button>
          ) : null}

          <button
            onClick={() => setShowQR(!showQR)}
            className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-secondary transition-colors border border-border"
            title="Show Room QR Code"
          >
            <QrCode className="w-4 h-4" />
          </button>

          <button
            onClick={copyRoomLink}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            {copiedLink ? 'Copied' : 'Share Link'}
          </button>
        </div>
      </div>

      {/* Video Call grid if active */}
      {callActive && (
        <CallGrid
          localStream={localStream}
          remoteStreams={remoteStreams}
          micEnabled={micEnabled}
          cameraEnabled={cameraEnabled}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onToggleScreen={toggleScreen}
          onHangup={hangupCall}
        />
      )}

      {/* QR Code Modal Overlay */}
      {showQR && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <h3 className="font-semibold text-base">Scan to Join Room</h3>
            <p className="text-xs text-muted-foreground">
              Scan this QR code from any camera or mobile device to immediately join this encrypted mesh room.
            </p>
            <div className="bg-white p-4 rounded-xl inline-block mx-auto">
              <QRCodeSVG value={typeof window !== 'undefined' ? window.location.href : ''} size={200} />
            </div>
            <button
              onClick={() => setShowQR(false)}
              className="w-full py-2 bg-secondary text-foreground text-xs font-medium rounded-xl hover:bg-secondary/80 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main Chat and Peers Body */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col h-full bg-background/50">
          <MessageList messages={messages} currentUserId={identity?.userId || ''} />

          {typingUsers.size > 0 && (
            <div className="px-4 py-1 text-[11px] text-muted-foreground animate-pulse">
              {Array.from(typingUsers).join(', ').slice(0, 20)} is typing...
            </div>
          )}

          <Composer onSendMessage={handleSendMessage} onTyping={handleTyping} />
        </div>

        <PeerList peers={Array.from(peers.values())} myUserId={identity?.userId || ''} />
      </div>
    </div>
  );
}
