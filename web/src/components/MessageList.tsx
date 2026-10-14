import React, { useRef, useEffect } from 'react';
import { MessageRecord } from '../db/schema';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: MessageRecord[];
  currentUserId: string;
  onDeleteMessage?: (msgId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  onDeleteMessage,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

  const handleMediaLoad = () => {
    scrollToBottom('auto');
  };

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
    <div className="p-4 flex flex-col min-h-full">
      {/* Top flex spacer so small message counts sit naturally near bottom without justify-end breaking overflow */}
      <div className="flex-1 min-h-0" />
      <div className="space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSelf={msg.author === currentUserId}
            onMediaLoad={handleMediaLoad}
            onDelete={onDeleteMessage}
          />
        ))}
      </div>
      <div ref={bottomRef} className="h-px shrink-0" />
    </div>
  );
};
