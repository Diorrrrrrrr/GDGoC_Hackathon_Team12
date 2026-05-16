'use client';

import { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const BODY_TOKEN = process.env.NEXT_PUBLIC_AGORA_BODY_TOKEN ?? process.env.NEXT_PUBLIC_AGORA_TOKEN!;
const BODY_CHANNEL = process.env.NEXT_PUBLIC_AGORA_BODY_CHANNEL ?? 'body';

export default function AgoraBodyViewer() {
  const videoRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);

  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    client.setClientRole('audience');
    clientRef.current = client;

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === 'video' && videoRef.current) {
        user.videoTrack?.play(videoRef.current);
        setConnected(true);
      }
    });

    client.on('user-unpublished', () => setConnected(false));
    client.join(APP_ID, BODY_CHANNEL, BODY_TOKEN, null).catch(console.error);

    return () => { client.leave(); };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={videoRef} className="w-full h-full" />
      {!connected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-white/40 text-xs">신호 대기 중...</span>
        </div>
      )}
    </div>
  );
}
