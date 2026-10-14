import React from 'react';
import { MessageRecord } from '../db/schema';
import { MarkdownRenderer } from './Markdown';
import { formatTime } from '../lib/utils';
import { CheckCheck, ShieldCheck } from 'lucide-react';

interface MessageBubbleProps {
  message: MessageRecord;
  isSelf: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isSelf }) => {
  const body = message.body as { Text?: { markdown: string }; System?: unknown };
  const text = body?.Text?.markdown || '';

  return (
    <div className={`flex flex-col mb-4 ${isSelf ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {isSelf ? 'You' : message.author.slice(0, 10)}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {formatTime(message.sentAtMs)}
        </span>
        <span title="Cryptographically signed & verified">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
        </span>
      </div>

      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isSelf
            ? 'bg-primary text-primary-foreground rounded-tr-xs'
            : 'bg-card text-card-foreground border border-border rounded-tl-xs'
        }`}
      >
        <MarkdownRenderer content={text} />
      </div>

      {isSelf && (
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <CheckCheck className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground/70">Verified</span>
        </div>
      )}
    </div>
  );
};
