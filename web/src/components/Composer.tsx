import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile, X, FileText, Image as ImageIcon } from 'lucide-react';

export interface AttachedFile {
  name: string;
  size: number;
  mime: string;
  dataUrl: string;
}

interface ComposerProps {
  onSendMessage: (text: string) => void;
  onSendFile?: (file: AttachedFile) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
}

const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😋', '😜', '🤪', '😎', '🥳', '🥺', '😱', '🤫', '🤔'],
  },
  {
    name: 'Gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤙', '👊', '✊', '🤛', '🤜', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '👋', '🙏', '💪'],
  },
  {
    name: 'Symbols & Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '✨', '🌟', '💫', '🔥', '💥', '⚡️', '💯', '💬', '🔔'],
  },
  {
    name: 'Objects & Food',
    emojis: ['🚀', '🛸', '💻', '📱', '🔒', '🔑', '🛡️', '📦', '✉️', '📝', '💡', '🔍', '☕️', '🍕', '🍔', '🍰', '🍻', '🥂', '🍿', '🎈', '🎉', '🎁', '🏆', '🎯'],
  },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  onSendFile,
  onTyping,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

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
    const trimmed = text.trim();
    if ((!trimmed && !attachedFile) || disabled) return;

    if (attachedFile) {
      if (onSendFile) {
        onSendFile(attachedFile);
      } else {
        // Fallback markdown format
        const fileMd = attachedFile.mime.startsWith('image/')
          ? `![${attachedFile.name}](${attachedFile.dataUrl})`
          : `[📄 ${attachedFile.name} (${formatBytes(attachedFile.size)})](${attachedFile.dataUrl})`;
        onSendMessage(trimmed ? `${trimmed}\n\n${fileMd}` : fileMd);
      }
      setAttachedFile(null);
    }

    if (trimmed && (!attachedFile || onSendFile)) {
      onSendMessage(trimmed);
    }

    setText('');
    onTyping?.(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachedFile({
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        dataUrl: result,
      });
    };
    reader.readAsDataURL(file);

    // reset file input value so re-selecting same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInsertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart || text.length;
      const end = textarea.selectionEnd || text.length;
      const newText = text.substring(0, start) + emoji + text.substring(end);
      setText(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setText((prev) => prev + emoji);
    }
  };

  const isImage = attachedFile?.mime.startsWith('image/');

  return (
    <div className="p-3 bg-card border-t border-border relative">
      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-16 right-4 sm:right-12 z-50 w-72 sm:w-80 bg-popover border border-border rounded-2xl shadow-2xl p-3 flex flex-col gap-2 max-h-72"
        >
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-border/50 text-xs">
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(idx)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  activeCategory === idx
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Emoji Grid */}
          <div className="grid grid-cols-7 sm:grid-cols-8 gap-1 overflow-y-auto max-h-48 p-1">
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleInsertEmoji(emoji)}
                className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-secondary/80 hover:scale-110 active:scale-95 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File Attachment Preview Chip */}
      {attachedFile && (
        <div className="mb-2 flex items-center gap-2 p-2 bg-secondary/70 border border-border rounded-xl max-w-sm">
          {isImage ? (
            <img
              src={attachedFile.dataUrl}
              alt={attachedFile.name}
              className="w-10 h-10 object-cover rounded-lg shrink-0 border border-border"
            />
          ) : (
            <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-medium text-foreground truncate">{attachedFile.name}</p>
            <p className="text-[10px] text-muted-foreground">{formatBytes(attachedFile.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-background/80 transition-colors"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex items-end gap-2 bg-background border border-border rounded-xl p-2 focus-within:border-primary/60 transition-colors">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type here..."
          className="flex-1 max-h-32 min-h-[36px] bg-transparent resize-none text-sm text-foreground focus:outline-none py-1.5 px-2"
        />

        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-1.5 rounded-lg transition-colors ${
            showEmojiPicker
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          title="Insert emoji"
        >
          <Smile className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={(!text.trim() && !attachedFile) || disabled}
          className="p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
