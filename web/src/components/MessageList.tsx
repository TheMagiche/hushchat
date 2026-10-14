import React, { useRef, useEffect } from 'react';
import { MessageRecord } from '../db/schema';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: MessageRecord[];
  currentUserId: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, currentUserId }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3 text-xl">
          💬
        </div>
        <p className="text-sm font-medium text-foreground">No messages yet</p>
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
          Messages and media sent in this peer-to-peer room are end-to-end encrypted and transmitted directly via WebRTC.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 min-h-full flex flex-col justify-end">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} isSelf={msg.author === currentUserId} />
      ))}
      <div ref={bottomRef} className="h-px" />
    </div>
  );
};
