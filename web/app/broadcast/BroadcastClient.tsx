'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createClient } from '@/lib/supabase/client';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const TOKEN = process.env.NEXT_PUBLIC_AGORA_TOKEN!;
const CHANNEL = process.env.NEXT_PUBLIC_AGORA_CHANNEL!;

function extractFaceMetrics(video: HTMLVideoElement): { redness: number; paleness: number } {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 120;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, 160, 120);
  const x = 48, y = 24, w = 64, h = 48;
  const imageData = ctx.getImageData(x, y, w, h);
  const pixels = imageData.data;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    rSum += pixels[i]; gSum += pixels[i + 1]; bSum += pixels[i + 2]; count++;
  }
  const r = rSum / count, g = gSum / count, b = bSum / count;
  const redness = Math.min(1, r / (g + b + 1));
  const brightness = (r + g + b) / 3 / 255;
  const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / (Math.max(r, g, b) + 1);
  const paleness = Math.min(1, brightness * (1 - saturation));
  return { redness: +redness.toFixed(3), paleness: +paleness.toFixed(3) };
}

function calcEyeClosure(landmarks: { x: number; y: number }[]): number {
  if (!landmarks || landmarks.length < 478) return 0;
  const leftTop = landmarks[159], leftBot = landmarks[145];
  const leftLeft = landmarks[133], leftRight = landmarks[33];
  const leftEAR = Math.abs(leftTop.y - leftBot.y) / (Math.abs(leftLeft.x - leftRight.x) + 0.001);
  const rightTop = landmarks[386], rightBot = landmarks[374];
  const rightLeft = landmarks[362], rightRight = landmarks[263];
  const rightEAR = Math.abs(rightTop.y - rightBot.y) / (Math.abs(rightLeft.x - rightRight.x) + 0.001);
  return +Math.min(1, Math.max(0, 1 - ((leftEAR + rightEAR) / 2) / 0.25)).toFixed(3);
}

export default function BroadcastClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const userIdRef = useRef<string | null>(null);
  const supabaseRef = useRef(createClient());
  const [broadcasting, setBroadcasting] = useState(false);
  const [status, setStatus] = useState('대기 중');
  const [metrics, setMetrics] = useState({ redness: 0, paleness: 0, eye_closure: 0, face_detected: false });

  useEffect(() => {
    async function initMediaPipe() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    }
    initMediaPipe();
  }, []);

  const runAnalysis = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !userIdRef.current) return;
    const supabase = supabaseRef.current;

    const colorMetrics = extractFaceMetrics(video);
    let eye_closure = 0, face_detected = false;

    if (landmarkerRef.current && video.readyState >= 2) {
      const result = landmarkerRef.current.detectForVideo(video, Date.now());
      if (result.faceLandmarks.length > 0) {
        face_detected = true;
        eye_closure = calcEyeClosure(result.faceLandmarks[0] as { x: number; y: number }[]);
      }
    }

    const newMetrics = { ...colorMetrics, eye_closure, face_detected };
    setMetrics(newMetrics);

    await supabase.from('face_metrics').insert({
      user_id: userIdRef.current,
      redness: newMetrics.redness,
      paleness: newMetrics.paleness,
      eye_closure: newMetrics.eye_closure,
      face_detected,
    });
  }, []);

  async function startBroadcast() {
    setStatus('연결 중...');

    const { data: { session } } = await supabaseRef.current.auth.getSession();
    userIdRef.current = session?.user?.id ?? '00000000-0000-0000-0000-000000000001';

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    const videoTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: stream.getVideoTracks()[0] });
    const audioTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: stream.getAudioTracks()[0] });

    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    client.setClientRole('host');
    clientRef.current = client;

    await client.join(APP_ID, CHANNEL, TOKEN, null);
    await client.publish([audioTrack, videoTrack]);

    setBroadcasting(true);
    setStatus('방송 중');
    analysisRef.current = setInterval(runAnalysis, 1000);
  }

  async function stopBroadcast() {
    if (analysisRef.current) clearInterval(analysisRef.current);
    const video = videoRef.current;
    if (video) {
      (video.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    await clientRef.current?.leave();
    setBroadcasting(false);
    setStatus('방송 종료');
  }

  useEffect(() => () => { stopBroadcast(); }, []);

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-white text-xl font-bold">📡 방송 송출</div>

      <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden border border-white/10">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        {!broadcasting && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white/30 text-sm">방송 시작 후 미리보기가 표시됩니다</span>
          </div>
        )}
      </div>

      {broadcasting && (
        <div className="w-full max-w-2xl bg-white/5 rounded-2xl p-4 flex gap-6">
          {[
            { label: '홍조', value: metrics.redness, color: '#f87171' },
            { label: '창백', value: metrics.paleness, color: '#94a3b8' },
            { label: '눈감김', value: metrics.eye_closure, color: '#fbbf24' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-white/60">
                <span>{label}</span><span>{(value * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${value * 100}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${broadcasting ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white/70 text-sm">{status}</span>
      </div>

      {!broadcasting ? (
        <button onClick={startBroadcast} className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all">
          방송 시작
        </button>
      ) : (
        <button onClick={stopBroadcast} className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition-all">
          방송 종료
        </button>
      )}
    </div>
  );
}
