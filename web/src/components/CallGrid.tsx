import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, ScreenShare, PhoneOff } from 'lucide-react';

interface CallGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onHangup: () => void;
}

export const CallGrid: React.FC<CallGridProps> = ({
  localStream,
  remoteStreams,
  micEnabled,
  cameraEnabled,
  onToggleMic,
  onToggleCamera,
  onToggleScreen,
  onHangup,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div className="bg-black/90 p-4 border-b border-border flex flex-col items-center">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-4xl mb-4">
        {/* Local video tile */}
        <div className="relative aspect-video bg-secondary rounded-xl overflow-hidden border border-border flex items-center justify-center">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
          />
          <span className="absolute bottom-2 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded text-white font-medium">
            You {!micEnabled && '(Muted)'}
          </span>
        </div>

        {/* Remote video tiles */}
        {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
          <RemoteVideoTile key={peerId} peerId={peerId} stream={stream} />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-2xl border border-border shadow-lg">
        <button
          onClick={onToggleMic}
          className={`p-2.5 rounded-xl transition-colors ${
            micEnabled ? 'bg-secondary text-foreground' : 'bg-destructive text-destructive-foreground'
          }`}
          title={micEnabled ? 'Mute Mic' : 'Unmute Mic'}
        >
          {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <button
          onClick={onToggleCamera}
          className={`p-2.5 rounded-xl transition-colors ${
            cameraEnabled ? 'bg-secondary text-foreground' : 'bg-destructive text-destructive-foreground'
          }`}
          title={cameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>

        <button
          onClick={onToggleScreen}
          className="p-2.5 bg-secondary text-foreground hover:bg-accent rounded-xl transition-colors"
          title="Share Screen"
        >
          <ScreenShare className="w-4 h-4" />
        </button>

        <button
          onClick={onHangup}
          className="p-2.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-colors"
          title="Leave Call"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const RemoteVideoTile: React.FC<{ peerId: string; stream: MediaStream }> = ({ peerId, stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative aspect-video bg-secondary rounded-xl overflow-hidden border border-border flex items-center justify-center">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <span className="absolute bottom-2 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded text-white font-medium">
        {peerId.slice(0, 10)}
      </span>
    </div>
  );
};
