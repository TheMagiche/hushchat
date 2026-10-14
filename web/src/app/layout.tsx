import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'HushChat — Serverless Encrypted P2P Chat',
  description: 'Browser-first peer-to-peer messaging, rooms, audio/video calls and file transfer powered by Rust, WASM, PeerJS and WebRTC.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
