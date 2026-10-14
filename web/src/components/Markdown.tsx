import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline hover:text-primary/80"
            />
          ),
          code: ({ ...props }) => (
            <code
              {...props}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary"
            />
          ),
          pre: ({ ...props }) => (
            <pre
              {...props}
              className="my-2 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-foreground"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
