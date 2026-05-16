'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC, { type ILocalVideoTrack, type ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createClient } from '@/lib/supabase/client';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const TOKEN = process.env.NEXT_PUBLIC_AGORA_TOKEN!;
const CHANNEL = process.env.NEXT_PUBLIC_AGORA_CHANNEL!;

function extractFaceMetrics(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);

  // 얼굴 중앙 영역 추정 (전체 프레임의 30~70%)
  const x = Math.floor(canvas.width * 0.3);
  const y = Math.floor(canvas.height * 0.2);
  const w = Math.floor(canvas.width * 0.4);
  const h = Math.floor(canvas.height * 0.4);
  const imageData = ctx.getImageData(x, y, w, h);
  const pixels = imageData.data;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    rSum += pixels[i];
    gSum += pixels[i + 1];
    bSum += pixels[i + 2];
    count++;
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
  // 왼쪽 눈: 159(위), 145(아래), 133(왼), 33(오른)
  const leftTop = landmarks[159], leftBot = landmarks[145];
  const leftLeft = landmarks[133], leftRight = landmarks[33];
  const leftEAR = Math.abs(leftTop.y - leftBot.y) / (Math.abs(leftLeft.x - leftRight.x) + 0.001);

  // 오른쪽 눈: 386(위), 374(아래), 362(왼), 263(오른)
  const rightTop = landmarks[386], rightBot = landmarks[374];
  const rightLeft = landmarks[362], rightRight = landmarks[263];
  const rightEAR = Math.abs(rightTop.y - rightBot.y) / (Math.abs(rightLeft.x - rightRight.x) + 0.001);

  const avgEAR = (leftEAR + rightEAR) / 2;
  const closure = Math.min(1, Math.max(0, 1 - avgEAR / 0.25));
  return +closure.toFixed(3);
}

export default function BroadcastClient() {
  const videoRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [status, setStatus] = useState('대기 중');
  const [metrics, setMetrics] = useState({ redness: 0, paleness: 0, eye_closure: 0 });
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
  const tracksRef = useRef<[ILocalAudioTrack, ILocalVideoTrack] | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const runAnalysis = useCallback(async (videoEl: HTMLVideoElement) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const colorMetrics = extractFaceMetrics(videoEl);
    let eye_closure = 0;
    let face_detected = false;

    if (landmarkerRef.current && videoEl.readyState >= 2) {
      const result = landmarkerRef.current.detectForVideo(videoEl, Date.now());
      if (result.faceLandmarks.length > 0) {
        face_detected = true;
        eye_closure = calcEyeClosure(result.faceLandmarks[0] as { x: number; y: number }[]);
      }
    }

    const newMetrics = { ...colorMetrics, eye_closure };
    setMetrics(newMetrics);

    await supabase.from('face_metrics').insert({
      user_id: user.id,
      redness: newMetrics.redness,
      paleness: newMetrics.paleness,
      eye_closure: newMetrics.eye_closure,
      face_detected,
    });
  }, []);

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

    // 영상 엘리먼트 가져오기
    setTimeout(() => {
      const videoEl = videoRef.current?.querySelector('video');
      if (videoEl) {
        videoElRef.current = videoEl;
        intervalRef.current = setInterval(() => runAnalysis(videoEl), 1000);
      }
    }, 1500);
  }

  async function stopBroadcast() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (tracksRef.current) tracksRef.current.forEach(t => { t.stop(); t.close(); });
    await clientRef.current?.leave();
    setBroadcasting(false);
    setStatus('방송 종료');
  }

  useEffect(() => () => { stopBroadcast(); }, []);

  const metricBar = (label: string, value: number, color: string) => (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-white/60">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value * 100}%`, background: color }} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-white text-xl font-bold">📡 방송 송출</div>

      <div ref={videoRef} className="w-full max-w-md aspect-video bg-black rounded-2xl overflow-hidden border border-white/10" />

      {broadcasting && (
        <div className="w-full max-w-md bg-white/5 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-white/50 text-xs font-bold uppercase tracking-wider">실시간 분석</p>
          {metricBar('홍조 (Redness)', metrics.redness, '#f87171')}
          {metricBar('창백 (Paleness)', metrics.paleness, '#94a3b8')}
          {metricBar('눈 감김 (Eye Closure)', metrics.eye_closure, '#fbbf24')}
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
