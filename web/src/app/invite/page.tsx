'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/state/store';
import { ArrowLeft, UserPlus, QrCode, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function InvitePage() {
  const router = useRouter();
  const { identity, addContact, initApp } = useChatStore();
  const [targetId, setTargetId] = useState('');
  const [contactName, setContactName] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    initApp();
  }, [initApp]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId.trim()) return;

    await addContact({
      userId: targetId.trim(),
      name: contactName.trim() || `Peer-${targetId.trim().slice(-4)}`,
      ed25519Pub: new Uint8Array(32),
      x25519Pub: new Uint8Array(32),
      verified: false,
      blocked: false,
      lastSeenMs: Date.now(),
      status: 'offline',
    });

    router.push(`/dm?id=${encodeURIComponent(targetId.trim())}`);
  };

  const copyInviteLink = () => {
    if (!identity?.userId) return;
    const url = `${window.location.origin}/invite#id=${identity.userId}&name=${encodeURIComponent(
      identity.profileName
    )}`;
    navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-background p-4 md:p-8">
      <div className="max-w-xl w-full mx-auto space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <Link
            href="/"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Add Contact & Share Invite</h1>
            <p className="text-xs text-muted-foreground">
              Exchange cryptographic identities for direct persistent 1:1 DMs.
            </p>
          </div>
        </div>

        {/* Share my invite card */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 text-center">
          <h2 className="font-semibold text-sm">Your Personal QR Code</h2>
          <div className="bg-white p-4 rounded-2xl inline-block mx-auto">
            <QRCodeSVG
              value={typeof window !== 'undefined' ? `${window.location.origin}/invite#id=${identity?.userId || ''}` : ''}
              size={180}
            />
          </div>
          <button
            onClick={copyInviteLink}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-primary text-primary-foreground text-xs font-medium rounded-xl hover:bg-primary/90 transition-colors"
          >
            {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedInvite ? 'Copied Invite Link' : 'Copy Shareable Invite Link'}
          </button>
        </div>

        {/* Add contact manual form */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Add by User ID</h2>
          </div>

          <form onSubmit={handleAddContact} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Contact's PeerChat User ID</label>
              <input
                type="text"
                placeholder="pc-..."
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nickname (Optional)</label>
              <input
                type="text"
                placeholder="Alice"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              disabled={!targetId.trim()}
              className="w-full py-2.5 bg-secondary text-foreground text-xs font-medium rounded-xl hover:bg-secondary/80 border border-border transition-colors disabled:opacity-50"
            >
              Add Contact & Open DM
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
