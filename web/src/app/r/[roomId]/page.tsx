import RoomClient from './RoomClient';

export function generateStaticParams() {
  return [{ roomId: 'lobby' }, { roomId: 'general' }];
}

export default function RoomPage() {
  return <RoomClient />;
}
