'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChatStore } from '@/state/store';
import { MeshTransport } from '@/chat-core/transport';
import { MessageList } from '@/components/MessageList';
import { Composer } from '@/components/Composer';
import {
  ShieldCheck,
  ArrowLeft,
  Phone,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';

export default function DMClient() {
  const params = useParams();
  const router = useRouter();
  const targetUserId = (params?.userId as string) || 'welcome';
  const {
    identity,
    wasm,
    messages,
    contacts,
    typingUsers,
    addMessage,
    addPeer,
    removePeer,
    setTyping,
    initApp,
    loadHistory,
    addContact,
  } = useChatStore();

  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [isVerified, setIsVerified] = useState(false);
  const transportRef = useRef<MeshTransport | null>(null);

  useEffect(() => {
    initApp();
  }, [initApp]);

  const contact = contacts.find((c) => c.userId === targetUserId);

  useEffect(() => {
    if (!wasm || !identity) return;

    loadHistory(`dm:${targetUserId}`);

    const wasmId = new wasm.WasmIdentity();
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
      },
      onPeerLeave: (uid) => {
        removePeer(uid);
      },
      onTyping: (uid, isTyping) => {
        setTyping(uid, isTyping);
      },
    });

    transportRef.current = transport;
    transport.init(peerjsId);

    return () => {
      transport.close();
    };
  }, [wasm, identity, targetUserId, contact, addMessage, addPeer, removePeer, setTyping, loadHistory]);

  const handleSendMessage = (text: string) => {
    transportRef.current?.broadcastTextMessage(`dm:${targetUserId}`, text);
  };

  const handleTyping = (isTyping: boolean) => {
    transportRef.current?.sendTyping(isTyping);
  };

  const toggleVerification = async () => {
    if (!contact) return;
    const nextVerified = !isVerified;
    setIsVerified(nextVerified);
    await addContact({ ...contact, verified: nextVerified });
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
              <h2 className="font-semibold text-sm">{contact?.name || targetUserId.slice(0, 12)}</h2>
              {isVerified ? (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                  <ShieldCheck className="w-3 h-3" /> Verified Contact
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                  <ShieldAlert className="w-3 h-3" /> Unverified
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">{targetUserId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
      </div>

      {/* Safety number banner */}
      {safetyNumber && (
        <div className="p-2.5 bg-secondary/30 border-b border-border text-center text-xs">
          <span className="text-muted-foreground mr-2 font-medium">Safety Number:</span>
          <span className="font-mono text-primary font-semibold tracking-wider">{safetyNumber}</span>
        </div>
      )}

      {/* Message and Composer Area */}
      <div className="flex-1 flex flex-col h-full bg-background/50">
        <MessageList messages={messages} currentUserId={identity?.userId || ''} />

        {typingUsers.size > 0 && (
          <div className="px-4 py-1 text-[11px] text-muted-foreground animate-pulse">
            Contact is typing...
          </div>
        )}

        <Composer onSendMessage={handleSendMessage} onTyping={handleTyping} />
      </div>
    </div>
  );
}
