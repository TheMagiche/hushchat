import { Suspense } from 'react';
import RoomClient from './RoomClient';

export function generateStaticParams() {
  return [{ roomId: 'lobby' }, { roomId: 'general' }];
}

export default function RoomParamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center h-screen bg-background text-muted-foreground text-sm">
          Loading room...
        </div>
      }
    >
      <RoomClient />
    </Suspense>
  );
}
