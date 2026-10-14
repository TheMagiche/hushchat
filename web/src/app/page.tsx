'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChatStore } from '../state/store';
import {
  Shield,
  MessageSquare,
  Users,
  Settings as SettingsIcon,
  Plus,
  Lock,
  Globe,
  ArrowRight,
  Copy,
  Check,
  Download,
  Laptop,
  Monitor,
  Terminal,
  Smartphone,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { identity, contacts, conversations, initApp } = useChatStore();
  const [roomName, setRoomName] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    initApp();
  }, [initApp]);

  const handleCreatePublicRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    router.push(`/r?id=${encodeURIComponent(roomName.trim().toLowerCase().replace(/\s+/g, '-'))}`);
  };

  const handleCreatePrivateRoom = () => {
    const roomId = `room-${Math.random().toString(36).slice(2, 10)}`;
    const secret = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    router.push(`/r?id=${roomId}#k=${secret}`);
  };

  const copyUserId = () => {
    if (!identity?.userId) return;
    navigator.clipboard.writeText(identity.userId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      {/* Sidebar / Navigation */}
      <div className="w-full md:w-80 bg-card border-r border-border flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-tight">PeerChat</h1>
              <p className="text-[10px] text-muted-foreground">Serverless P2P Mesh</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/download"
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              title="Download Desktop & Mobile Apps"
            >
              <Download className="w-4 h-4" />
            </Link>
            <Link
              href="/settings"
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              title="Settings & Privacy"
            >
              <SettingsIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Identity card */}
        <div className="p-3 mx-3 my-2 rounded-xl bg-secondary/40 border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-foreground">
              {identity?.profileName || 'Your Identity'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
              Online
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-muted-foreground bg-background/50 p-1.5 rounded-lg border border-border/50">
            <span className="truncate">{identity?.userId || 'Generating...'}</span>
            <button
              onClick={copyUserId}
              className="p-1 hover:text-foreground transition-colors"
              title="Copy User ID"
            >
              {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Conversations & Contacts tabs */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Chats
              </span>
            </div>
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 px-1 py-2">No active conversations</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={conv.id.startsWith('dm:') ? `/dm?id=${conv.id.replace('dm:', '')}` : `/r?id=${conv.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/60 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{conv.previewText}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contacts ({contacts.length})
              </span>
              <Link href="/invite" className="text-xs text-primary hover:underline">
                + Add
              </Link>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 px-1 py-2">No saved contacts yet</p>
            ) : (
              <div className="space-y-1">
                {contacts.map((c) => (
                  <Link
                    key={c.userId}
                    href={`/dm?id=${c.userId}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/60 transition-colors"
                  >
                    <p className="text-xs font-medium">{c.name}</p>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {c.userId.slice(0, 8)}...
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto">
        <div className="max-w-xl w-full space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Decentralized WebRTC Mesh Chat</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No central server or database stores your conversations. All messages, calls, and files are
              end-to-end encrypted and routed directly between peers using Rust/WASM and WebRTC.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Create / Join Public Room */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-base">Public Room</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Join or create a named room open to anyone with the room name.
                </p>
              </div>

              <form onSubmit={handleCreatePublicRoom} className="space-y-2">
                <input
                  type="text"
                  placeholder="e.g. general, rust-dev"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!roomName.trim()}
                  className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium py-2 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Join Room <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* Create Private Secret Room */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-base">Secret Private Room</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Generates an unguessable 128-bit key stored only in the URL fragment (#k=secret).
                </p>
              </div>

              <button
                onClick={handleCreatePrivateRoom}
                className="w-full flex items-center justify-center gap-1.5 bg-secondary text-foreground text-xs font-medium py-2 rounded-xl hover:bg-secondary/80 border border-border transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Create Secret Room
              </button>
            </div>
          </div>

          {/* Download Platforms Banner */}
          <div className="bg-card/60 border border-border rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold">Native Desktop & Mobile Apps</p>
                <p className="text-[11px] text-muted-foreground">macOS, Windows, Linux, Android</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/download"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium border border-border transition-colors"
              >
                Download Apps <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Quick info badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-4 border-t border-border">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" /> Rust + WASM Crypto
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" /> Full Mesh Topology
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> Ephemeral by Default
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
