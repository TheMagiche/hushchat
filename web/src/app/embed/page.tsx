'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useChatStore } from '@/state/store';
import { MeshTransport } from '@/chat-core/transport';
import { MessageList } from '@/components/MessageList';
import { Composer } from '@/components/Composer';

function EmbedContent() {
  const searchParams = useSearchParams();
  const room = searchParams.get('room') || 'embed-room';
  const name = searchParams.get('name') || 'Guest';

  const { identity, wasm, messages, addMessage, addPeer, removePeer, setTyping, initApp } =
    useChatStore();

  const transportRef = useRef<MeshTransport | null>(null);

  useEffect(() => {
    initApp();
  }, [initApp]);

  useEffect(() => {
    if (!wasm || !identity) return;

    const wasmId = new wasm.WasmIdentity();
    const peerjsId = wasmId.generatePeerjsId();

    const transport = new MeshTransport(wasmId, name, {
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

    transport.init(peerjsId).then(() => {
      transport.joinRoom(room);
    });

    return () => {
      transport.close();
    };
  }, [wasm, identity, room, name, addMessage, addPeer, removePeer, setTyping]);

  const handleSendMessage = (text: string) => {
    transportRef.current?.broadcastTextMessage(`room:${room}`, text);
  };

  const handleTyping = (isTyping: boolean) => {
    transportRef.current?.sendTyping(isTyping);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      <div className="p-2.5 bg-card border-b border-border flex items-center justify-between text-xs">
        <span className="font-semibold text-primary">#{room} (Embedded)</span>
        <span className="text-[10px] text-muted-foreground">PeerChat E2EE</span>
      </div>

      <div className="flex-1 flex flex-col h-full bg-background/50">
        <MessageList messages={messages} currentUserId={identity?.userId || ''} />
        <Composer onSendMessage={handleSendMessage} onTyping={handleTyping} />
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Loading PeerChat embed...</div>}>
      <EmbedContent />
    </Suspense>
  );
}
