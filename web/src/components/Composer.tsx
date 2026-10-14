import React, { useState, useRef } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';

interface ComposerProps {
  onSendMessage: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  onTyping,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    onTyping?.(true);

    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      onTyping?.(false);
    }, 1500);
  };

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim());
    setText('');
    onTyping?.(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  };

  return (
    <div className="p-3 bg-card border-t border-border">
      <div className="flex items-end gap-2 bg-background border border-border rounded-xl p-2 focus-within:border-primary/60 transition-colors">
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <textarea
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type markdown message... (Shift+Enter for newline)"
          className="flex-1 max-h-32 min-h-[36px] bg-transparent resize-none text-sm text-foreground focus:outline-none py-1.5 px-2"
        />

        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          title="Insert emoji"
        >
          <Smile className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
