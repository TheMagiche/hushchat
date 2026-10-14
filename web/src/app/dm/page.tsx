import { Suspense } from 'react';
import DMClient from './[userId]/DMClient';

export default function DMPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center h-screen bg-background text-muted-foreground text-sm">
          Loading direct message...
        </div>
      }
    >
      <DMClient />
    </Suspense>
  );
}
