import { Suspense } from 'react';
import DMClient from './DMClient';

export function generateStaticParams() {
  return [{ userId: 'welcome' }];
}

export default function DMParamPage() {
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
