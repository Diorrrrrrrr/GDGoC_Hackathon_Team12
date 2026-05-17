'use client';

import { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const TOKEN = process.env.NEXT_PUBLIC_AGORA_TOKEN!;
const CHANNEL = process.env.NEXT_PUBLIC_AGORA_CHANNEL!;

const OUTLINE = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000';

interface Metrics {
  redness: number;
  paleness: number;
  eye_closure: number;
  face_detected: boolean;
}

export default function AgoraViewer() {
  const t = useT();
  const videoRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ redness: 0, paleness: 0, eye_closure: 0, face_detected: false });

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
    client.join(APP_ID, CHANNEL, TOKEN, null).catch(console.error);

    return () => { client.leave(); };
  }, []);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('face_metrics')
      .select('redness, paleness, eye_closure, face_detected')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setMetrics(data[0] as Metrics); });

    const channel = supabase
      .channel('face_metrics_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'face_metrics' },
        (payload) => setMetrics(payload.new as Metrics)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={videoRef} className="w-full h-full" />

      {connected && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'monospace' }}>
          <div className="absolute top-2 left-2 flex flex-col gap-0.5">
            {[
              { label: `Redness: ${metrics.redness.toFixed(3)}`, color: '#f87171' },
              { label: `Paleness: ${metrics.paleness.toFixed(3)}`, color: '#ffffff' },
              { label: `Eye Closure: ${metrics.eye_closure.toFixed(3)}`, color: '#fbbf24' },
              {
                label: metrics.face_detected ? 'Face: DETECTED' : 'Face: NOT DETECTED',
                color: metrics.face_detected ? '#4ade80' : '#f87171',
              },
            ].map(({ label, color }) => (
              <span
                key={label}
                style={{
                  color,
                  textShadow: OUTLINE,
                  fontSize: '13px',
                  fontWeight: 'bold',
                  lineHeight: '1.6',
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="absolute top-2 right-2 flex items-center gap-1">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold', textShadow: OUTLINE }}>REC</span>
          </div>
        </div>
      )}

      {!connected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-white/40 text-xs">{t('waitingSignal')}</span>
        </div>
      )}
    </div>
  );
}
