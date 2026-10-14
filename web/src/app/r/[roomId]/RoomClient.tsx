'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChatStore, IncomingCallInfo } from '@/state/store';
import { MeshTransport } from '@/chat-core/transport';
import { MessageList } from '@/components/MessageList';
import { Composer, AttachedFile } from '@/components/Composer';
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
  Users,
  MoreVertical,
  PhoneOff,
  X,
  PhoneIncoming,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function RoomClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = (searchParams?.get('id') || searchParams?.get('room') || (params?.roomId as string) || 'general');
  const {
    identity,
    wasm,
    messages,
    peers,
    typingUsers,
    callActive,
    incomingCall,
    localStream,
    remoteStreams,
    micEnabled,
    cameraEnabled,
    addMessage,
    addPeer,
    removePeer,
    setTyping,
    setIncomingCall,
    toggleMic,
    toggleCamera,
    toggleScreen,
    initApp,
    getWasmIdentity,
    loadHistory,
  } = useChatStore();

  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [secretKey, setSecretKey] = useState<string | undefined>(undefined);
  const [showPeersDrawer, setShowPeersDrawer] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const transportRef = useRef<MeshTransport | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initApp();
  }, [initApp]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setShowMobileMenu(false);
      }
    };
    if (showMobileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMobileMenu]);

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

    const wasmId = getWasmIdentity() || new wasm.WasmIdentity();
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
      onIncomingCall: (callerPeerId, callerUserId, callerName, mediaConn) => {
        setIncomingCall({ callerPeerId, callerUserId, callerName, mediaConn });
      },
      onCallEnded: () => {
        setIncomingCall(null);
      },
    });

    transportRef.current = transport;

    transport.init(peerjsId).then(() => {
      transport.joinRoom(roomId, secretKey);
    });

    return () => {
      transport.close();
    };
  }, [wasm, identity, roomId, secretKey, addMessage, addPeer, removePeer, setTyping, setIncomingCall, loadHistory, getWasmIdentity]);

  const handleSendMessage = (text: string) => {
    transportRef.current?.broadcastTextMessage(`room:${roomId}`, text);
  };

  const handleSendFile = (file: AttachedFile) => {
    transportRef.current?.broadcastFileMessage(`room:${roomId}`, file);
  };

  const handleTyping = (isTyping: boolean) => {
    transportRef.current?.sendTyping(isTyping);
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      useChatStore.setState({ callActive: true, localStream: stream, incomingCall: null });
      transportRef.current?.callAllPeers(stream);
    } catch (err) {
      console.warn('Failed to start call:', err);
    }
  };

  const handleAcceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      useChatStore.setState({ callActive: true, localStream: stream, incomingCall: null });
      transportRef.current?.callAllPeers(stream);
    } catch (err) {
      console.warn('Failed to answer call:', err);
    }
  };

  const handleDismissCall = () => {
    setIncomingCall(null);
  };

  const hangupCall = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    transportRef.current?.broadcastCallState(false);
    useChatStore.setState({
      callActive: false,
      localStream: null,
      remoteStreams: new Map(),
      incomingCall: null,
    });
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Navbar */}
      <div className="shrink-0 p-3 bg-card border-b border-border flex items-center justify-between relative z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-sm truncate">#{roomId}</h2>
              {secretKey ? (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                  <Lock className="w-3 h-3" /> Secret
                </span>
              ) : (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Public
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {peers.size + 1} connected • Ephemeral mesh
            </p>
          </div>
        </div>

        {/* Desktop actions (> md) */}
        <div className="hidden md:flex items-center gap-2">
          {!callActive ? (
            <button
              onClick={startCall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-accent text-xs font-medium text-foreground transition-colors border border-border"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" /> Start Call
            </button>
          ) : (
            <button
              onClick={hangupCall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-medium transition-colors border border-destructive/20"
            >
              <PhoneOff className="w-3.5 h-3.5" /> End Call
            </button>
          )}

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

        {/* Mobile controls (<= md): Peer Drawer Button & Dropdown Menu */}
        <div className="flex md:hidden items-center gap-1.5">
          <button
            onClick={() => setShowPeersDrawer(!showPeersDrawer)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-secondary text-foreground text-xs font-medium border border-border"
            title="Toggle connected peers"
          >
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>{peers.size + 1}</span>
          </button>

          <div className="relative" ref={mobileMenuRef}>
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-secondary border border-border transition-colors"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Mobile Dropdown Menu */}
            {showMobileMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-2xl shadow-2xl p-1.5 z-50 flex flex-col gap-1">
                {!callActive ? (
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      startCall();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary rounded-xl transition-colors text-left"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" /> Start Call
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      hangupCall();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors text-left"
                  >
                    <PhoneOff className="w-3.5 h-3.5" /> End Call
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowQR(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary rounded-xl transition-colors text-left"
                >
                  <QrCode className="w-3.5 h-3.5 text-primary" /> Show QR Code
                </button>

                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    copyRoomLink();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary rounded-xl transition-colors text-left"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5 text-primary" />
                  )}
                  {copiedLink ? 'Link Copied!' : 'Share Room Link'}
                </button>

                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowPeersDrawer(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary rounded-xl transition-colors text-left"
                >
                  <Users className="w-3.5 h-3.5 text-primary" /> Peers ({peers.size + 1})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Incoming Call Notification Banner */}
      {incomingCall && !callActive && (
        <div className="shrink-0 bg-primary/10 border-b border-primary/20 p-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse">
              <PhoneIncoming className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                {incomingCall.callerName || 'Room occupant'} started a call
              </p>
              <p className="text-[10px] text-muted-foreground">
                Other occupants in #{roomId} are invited to join audio/video
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleAcceptCall}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium shadow-sm transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> Join Call
            </button>
            <button
              onClick={handleDismissCall}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium border border-border transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Video Call grid if active */}
      {callActive && (
        <div className="shrink-0">
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
        </div>
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

      {/* Main Chat and Peers Body: Full height pinned chat area */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        <div className="flex-1 min-h-0 flex flex-col bg-background/50 overflow-hidden">
          {/* Scrollable messages occupying full area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <MessageList messages={messages} currentUserId={identity?.userId || ''} />
          </div>

          {typingUsers.size > 0 && (
            <div className="shrink-0 px-4 py-1 text-[11px] text-muted-foreground animate-pulse">
              {Array.from(typingUsers).join(', ').slice(0, 20)} is typing...
            </div>
          )}

          {/* Pin Composer at bottom */}
          <div className="shrink-0 w-full">
            <Composer
              onSendMessage={handleSendMessage}
              onSendFile={handleSendFile}
              onTyping={handleTyping}
            />
          </div>
        </div>

        {/* Desktop Peer list Sidebar (>= md) */}
        <div className="hidden md:block w-64 border-l border-border h-full shrink-0">
          <PeerList peers={Array.from(peers.values())} myUserId={identity?.userId || ''} />
        </div>

        {/* Mobile Peer list Drawer (< md) */}
        {showPeersDrawer && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
              onClick={() => setShowPeersDrawer(false)}
            />
            <div className="fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-card border-l border-border shadow-2xl md:hidden transition-transform animate-in slide-in-from-right duration-200">
              <PeerList
                peers={Array.from(peers.values())}
                myUserId={identity?.userId || ''}
                onClose={() => setShowPeersDrawer(false)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
