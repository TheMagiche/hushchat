'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChatStore } from '@/state/store';
import { MeshTransport } from '@/chat-core/transport';
import { MessageList } from '@/components/MessageList';
import { Composer, AttachedFile } from '@/components/Composer';
import { CallGrid } from '@/components/CallGrid';
import {
  ShieldCheck,
  ArrowLeft,
  Phone,
  PhoneOff,
  ShieldAlert,
  UserCheck,
  MoreVertical,
  Shield,
} from 'lucide-react';

export default function DMClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const targetUserId = (searchParams?.get('id') || searchParams?.get('userId') || (params?.userId as string) || 'welcome');
  const {
    identity,
    wasm,
    messages,
    contacts,
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
    initApp,
    getWasmIdentity,
    loadHistory,
    addContact,
    toggleMic,
    toggleCamera,
    toggleScreen,
  } = useChatStore();

  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [isVerified, setIsVerified] = useState(false);
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

  const contact = contacts.find((c) => c.userId === targetUserId);

  useEffect(() => {
    if (!wasm || !identity) return;

    loadHistory(`dm:${targetUserId}`);

    const wasmId = getWasmIdentity() || new wasm.WasmIdentity();
    const peerjsId = wasmId.generatePeerjsId();

    if (contact?.ed25519Pub) {
      try {
        const sn = wasmId.safetyNumberWith(contact.ed25519Pub);
        setSafetyNumber(sn);
        setIsVerified(contact.verified);
      } catch (err) {
        console.warn('Safety number computation error:', err);
      }
    }

    const transport = new MeshTransport(wasmId, identity.profileName, {
      onMessage: (msg) => {
        addMessage(msg);
      },
      onPeerJoin: (peer) => {
        addPeer(peer);
        if (peer.ed25519Pub) {
          try {
            const sn = wasmId.safetyNumberWith(peer.ed25519Pub);
            setSafetyNumber(sn);
          } catch (e) {
            console.warn('Failed to compute safety number on join:', e);
          }
        }
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
      // Deterministic DM rendezvous channel so both users meet
      const dmChannel = `dm-${[identity.userId, targetUserId].sort().join('-')}`;
      transport.joinRoom(dmChannel);
    });

    return () => {
      transport.close();
    };
  }, [wasm, identity, targetUserId, contact, addMessage, addPeer, removePeer, setTyping, loadHistory, getWasmIdentity]);

  const handleSendMessage = (text: string) => {
    transportRef.current?.broadcastTextMessage(`dm:${targetUserId}`, text);
  };

  const handleSendFile = (file: AttachedFile) => {
    transportRef.current?.broadcastFileMessage(`dm:${targetUserId}`, file);
  };

  const handleTyping = (isTyping: boolean) => {
    transportRef.current?.sendTyping(isTyping);
  };

  const toggleVerification = async () => {
    if (!contact) {
      // create contact and mark verified
      await addContact({
        userId: targetUserId,
        name: `Peer-${targetUserId.slice(-4)}`,
        ed25519Pub: new Uint8Array(32),
        x25519Pub: new Uint8Array(32),
        verified: true,
        blocked: false,
        lastSeenMs: Date.now(),
        status: 'online',
      });
      setIsVerified(true);
      return;
    }
    const nextVerified = !isVerified;
    setIsVerified(nextVerified);
    await addContact({ ...contact, verified: nextVerified });
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

  const isPeerOnline = peers.has(targetUserId) || peers.size > 0;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Navbar */}
      <div className="p-3 bg-card border-b border-border flex items-center justify-between relative z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-sm truncate">
                {contact?.name || `Peer-${targetUserId.slice(-4)}`}
              </h2>
              {isVerified ? (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              ) : (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                  <ShieldAlert className="w-3 h-3" /> Unverified
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {targetUserId} • {isPeerOnline ? 'Online' : 'Waiting for peer'}
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
            onClick={toggleVerification}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
              isVerified
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-secondary text-foreground hover:bg-accent border-border'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {isVerified ? 'Marked Verified' : 'Verify Safety Number'}
          </button>
        </div>

        {/* Mobile menu (<= md) */}
        <div className="flex md:hidden items-center gap-1.5" ref={mobileMenuRef}>
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-secondary border border-border transition-colors"
            title="More actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMobileMenu && (
            <div className="absolute right-3 top-full mt-2 w-52 bg-popover border border-border rounded-2xl shadow-2xl p-1.5 z-50 flex flex-col gap-1">
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
                  toggleVerification();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary rounded-xl transition-colors text-left"
              >
                <UserCheck className="w-3.5 h-3.5 text-primary" />
                {isVerified ? 'Unmark Verified' : 'Mark Verified'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Safety number banner */}
      {safetyNumber && (
        <div className="p-2.5 bg-secondary/30 border-b border-border text-center text-xs">
          <span className="text-muted-foreground mr-2 font-medium">Safety Number:</span>
          <span className="font-mono text-primary font-semibold tracking-wider">{safetyNumber}</span>
        </div>
      )}

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

      {/* Message and Composer Area */}
      <div className="flex-1 flex flex-col h-full bg-background/50 overflow-hidden">
        <MessageList messages={messages} currentUserId={identity?.userId || ''} />

        {typingUsers.size > 0 && (
          <div className="px-4 py-1 text-[11px] text-muted-foreground animate-pulse">
            Contact is typing...
          </div>
        )}

        <Composer
          onSendMessage={handleSendMessage}
          onSendFile={handleSendFile}
          onTyping={handleTyping}
        />
      </div>
    </div>
  );
}
