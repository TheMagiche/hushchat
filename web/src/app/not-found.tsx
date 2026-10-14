'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, ArrowLeft, RefreshCw } from 'lucide-react';

export default function NotFound() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const path = window.location.pathname;
    const hash = window.location.hash || '';

    // Check if path is like /r/room-name or /base/r/room-name
    const roomMatch = path.match(/\/r\/([^\/?#]+)/);
    if (roomMatch && roomMatch[1]) {
      setRedirecting(true);
      const roomId = decodeURIComponent(roomMatch[1]);
      router.replace(`/r?id=${encodeURIComponent(roomId)}${hash}`);
      return;
    }

    // Check if path is like /dm/user-id
    const dmMatch = path.match(/\/dm\/([^\/?#]+)/);
    if (dmMatch && dmMatch[1]) {
      setRedirecting(true);
      const userId = decodeURIComponent(dmMatch[1]);
      router.replace(`/dm?id=${encodeURIComponent(userId)}${hash}`);
      return;
    }
  }, [router]);

  if (redirecting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background text-foreground p-6 space-y-4">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Redirecting to chat session...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background text-foreground p-6 text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <Shield className="w-8 h-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Page Not Found (404)</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The requested room or page could not be located.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Return to HushChat
      </Link>
    </div>
  );
}
