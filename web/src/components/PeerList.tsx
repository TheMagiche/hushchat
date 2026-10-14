import React from 'react';
import { PeerItem } from '../state/store';
import { Users, Shield, Radio } from 'lucide-react';

interface PeerListProps {
  peers: PeerItem[];
  myUserId: string;
}

export const PeerList: React.FC<PeerListProps> = ({ peers, myUserId }) => {
  return (
    <div className="w-64 bg-card border-l border-border p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          Connected Peers ({peers.length + 1})
        </h3>
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-primary/20">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">You</p>
              <p className="text-[10px] text-muted-foreground truncate">{myUserId.slice(0, 12)}...</p>
            </div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">
            Self
          </span>
        </div>

        {peers.map((peer) => (
          <div
            key={peer.userId}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/40 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{peer.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {peer.userId.slice(0, 12)}...
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {peer.isAnchor && (
                <span title="Anchor Node">
                  <Radio className="w-3 h-3 text-amber-400" />
                </span>
              )}
              <span title="Verified E2EE">
                <Shield className="w-3 h-3 text-emerald-400" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
