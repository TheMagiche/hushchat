import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

interface MarkdownRendererProps {
  content: string;
  isSelf?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isSelf = false }) => {
  return (
    <div
      className={`prose prose-sm max-w-none break-words leading-relaxed ${
        isSelf
          ? 'prose-invert text-primary-foreground'
          : 'prose-invert text-foreground'
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              attributes: {
                ...defaultSchema.attributes,
                a: ['href', 'title', 'target', 'rel', 'className'],
              },
            },
          ],
        ]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={`underline underline-offset-2 break-all transition-colors ${
                isSelf
                  ? 'text-primary-foreground font-semibold hover:opacity-80'
                  : 'text-primary font-medium hover:text-primary/80'
              }`}
            />
          ),
          p: ({ ...props }) => <p {...props} className="my-0.5 leading-relaxed" />,
          code: ({ ...props }) => (
            <code
              {...props}
              className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                isSelf
                  ? 'bg-black/20 text-primary-foreground'
                  : 'bg-muted text-primary'
              }`}
            />
          ),
          pre: ({ ...props }) => (
            <pre
              {...props}
              className={`my-2 overflow-x-auto rounded-lg p-3 font-mono text-xs ${
                isSelf
                  ? 'bg-black/30 text-primary-foreground'
                  : 'bg-black/40 text-foreground'
              }`}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
