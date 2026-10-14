import React, { useState } from 'react';
import { PeerItem, useChatStore } from '../state/store';
import { Users, Radio, X, UserPlus, UserCheck } from 'lucide-react';

interface PeerListProps {
  peers: PeerItem[];
  myUserId: string;
  onClose?: () => void;
}

export const PeerList: React.FC<PeerListProps> = ({ peers, myUserId, onClose }) => {
  const { contacts, addContact } = useChatStore();
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  const handleAddPeerContact = async (peer: PeerItem) => {
    await addContact({
      userId: peer.userId,
      name: peer.name || `Peer-${peer.userId.slice(-4)}`,
      ed25519Pub: peer.ed25519Pub || new Uint8Array(32),
      x25519Pub: new Uint8Array(32),
      verified: !!peer.verified,
      blocked: false,
      lastSeenMs: Date.now(),
      status: 'online',
    });

    setJustAdded((prev) => new Set(prev).add(peer.userId));
    setTimeout(() => {
      setJustAdded((prev) => {
        const next = new Set(prev);
        next.delete(peer.userId);
        return next;
      });
    }, 2500);
  };

  return (
    <div className="w-full h-full bg-card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Connected Peers ({peers.length + 1})
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            title="Close peers drawer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/50 border border-primary/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">You</p>
              <p className="text-[10px] text-muted-foreground truncate">{myUserId.slice(0, 16)}...</p>
            </div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono font-medium">
            Self
          </span>
        </div>

        {peers.length === 0 ? (
          <div className="text-center py-6 px-2 text-xs text-muted-foreground/70">
            Waiting for peers to join this room...
          </div>
        ) : (
          peers.map((peer) => {
            const isAlreadyContact = contacts.some((c) => c.userId === peer.userId) || justAdded.has(peer.userId);

            return (
              <div
                key={peer.userId}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-secondary/40 border border-transparent hover:border-border transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{peer.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate font-mono">
                      {peer.userId.slice(0, 16)}...
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {peer.isAnchor && (
                    <span title="Anchor Node">
                      <Radio className="w-3.5 h-3.5 text-amber-400" />
                    </span>
                  )}
                  {isAlreadyContact ? (
                    <span
                      className="p-1 rounded-lg text-emerald-400 bg-emerald-500/10 text-xs flex items-center"
                      title="Contact saved"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddPeerContact(peer)}
                      className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                      title="Add to contacts"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
