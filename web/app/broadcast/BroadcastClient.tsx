'use client';

import { useEffect, useRef, useState } from 'react';
import AgoraRTC, { type ILocalVideoTrack, type ILocalAudioTrack } from 'agora-rtc-sdk-ng';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const TOKEN = process.env.NEXT_PUBLIC_AGORA_TOKEN!;
const CHANNEL = process.env.NEXT_PUBLIC_AGORA_CHANNEL!;

export default function BroadcastClient() {
  const videoRef = useRef<HTMLDivElement>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [status, setStatus] = useState('대기 중');
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
  const tracksRef = useRef<[ILocalAudioTrack, ILocalVideoTrack] | null>(null);

  async function startBroadcast() {
    setStatus('연결 중...');
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    client.setClientRole('host');
    clientRef.current = client;

    await client.join(APP_ID, CHANNEL, TOKEN, null);
    const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
    tracksRef.current = tracks;

    tracks[1].play(videoRef.current!);
    await client.publish(tracks);
    setBroadcasting(true);
    setStatus('방송 중');
  }

  async function stopBroadcast() {
    if (tracksRef.current) {
      tracksRef.current.forEach(t => { t.stop(); t.close(); });
    }
    await clientRef.current?.leave();
    setBroadcasting(false);
    setStatus('방송 종료');
  }

  useEffect(() => {
    return () => { stopBroadcast(); };
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-white text-xl font-bold">📡 방송 송출</div>

      <div
        ref={videoRef}
        className="w-full max-w-md aspect-video bg-black rounded-2xl overflow-hidden border border-white/10"
      />

      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${broadcasting ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white/70 text-sm">{status}</span>
      </div>

      {!broadcasting ? (
        <button
          onClick={startBroadcast}
          className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all"
        >
          방송 시작
        </button>
      ) : (
        <button
          onClick={stopBroadcast}
          className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition-all"
        >
          방송 종료
        </button>
      )}
    </div>
  );
}
