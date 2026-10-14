import { Suspense } from 'react';
import RoomClient from './[roomId]/RoomClient';

export default function RoomPage() {
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
