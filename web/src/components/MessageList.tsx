import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageRecord } from '../db/schema';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: MessageRecord[];
  currentUserId: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, currentUserId }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
          💬
        </div>
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
          Messages sent in this peer-to-peer room are end-to-end encrypted and transmitted directly via WebRTC.
        </p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto p-4 space-y-1">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index];
          return (
            <div
              key={msg.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageBubble message={msg} isSelf={msg.author === currentUserId} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
