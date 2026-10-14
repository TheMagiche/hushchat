import React, { useState } from 'react';
import { MessageRecord } from '../db/schema';
import { MarkdownRenderer } from './Markdown';
import { formatTime } from '../lib/utils';
import { CheckCheck, ShieldCheck, Download, FileText, Trash2 } from 'lucide-react';

interface MessageBubbleProps {
  message: MessageRecord;
  isSelf: boolean;
  onMediaLoad?: () => void;
  onDelete?: (msgId: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSelf,
  onMediaLoad,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rawBody = (message.body || {}) as any;
  const file = rawBody.File || rawBody.file;
  const text = rawBody.Text?.markdown || rawBody.text?.markdown || rawBody.markdown || (typeof rawBody === 'string' ? rawBody : '');

  const fileName = file?.name || 'attachment';
  const fileSize = file?.size || 0;
  const fileMime = file?.mime || file?.type || '';
  const fileDataUrl = file?.data_url || file?.dataUrl || file?.url || '';

  const isImageFile =
    Boolean(fileDataUrl) &&
    (fileMime.startsWith('image/') ||
      fileDataUrl.startsWith('data:image') ||
      /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(fileName));

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete?.(message.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div className={`group relative flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
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

        {/* Delete message button */}
        {onDelete && (
          <button
            onClick={handleDelete}
            className={`opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive text-[10px] flex items-center gap-1 ${
              confirmDelete ? '!opacity-100 text-destructive font-medium' : ''
            }`}
            title={confirmDelete ? 'Click again to confirm delete' : 'Delete message'}
          >
            <Trash2 className="w-3 h-3" />
            {confirmDelete && <span>Confirm</span>}
          </button>
        )}
      </div>

      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-xs space-y-2 ${
          isSelf
            ? 'bg-primary text-primary-foreground rounded-tr-xs'
            : 'bg-card text-card-foreground border border-border rounded-tl-xs'
        }`}
      >
        {/* File rendering */}
        {file && (
          <div className="space-y-2">
            {isImageFile && fileDataUrl ? (
              <div className="space-y-1.5">
                <img
                  src={fileDataUrl}
                  alt={fileName}
                  loading="lazy"
                  onLoad={onMediaLoad}
                  className="max-h-72 max-w-full rounded-xl object-contain border border-black/10 bg-black/20 block"
                />
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="truncate opacity-80">{fileName}</span>
                  <a
                    href={fileDataUrl}
                    download={fileName}
                    className={`flex items-center gap-1 p-1 rounded-lg transition-colors ${
                      isSelf
                        ? 'hover:bg-primary-foreground/20 text-primary-foreground'
                        : 'hover:bg-secondary text-primary'
                    }`}
                    title="Download image"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : (
              <div
                className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                  isSelf
                    ? 'bg-primary-foreground/10 border-primary-foreground/20'
                    : 'bg-secondary/60 border-border'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelf ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{fileName}</p>
                  <p className="text-[10px] opacity-75">{formatBytes(fileSize)}</p>
                </div>
                {fileDataUrl && (
                  <a
                    href={fileDataUrl}
                    download={fileName}
                    className={`p-2 rounded-lg transition-colors ${
                      isSelf
                        ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                    title="Download file"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Text rendering with sender contrast support */}
        {text && <MarkdownRenderer content={text} isSelf={isSelf} />}
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
