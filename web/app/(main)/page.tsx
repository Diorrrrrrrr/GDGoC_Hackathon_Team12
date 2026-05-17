'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { StatusLevel } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { Phone } from 'lucide-react';

const AgoraViewer = dynamic(() => import('@/components/AgoraViewer'), { ssr: false });
const AgoraBodyViewer = dynamic(() => import('@/components/AgoraBodyViewer'), { ssr: false });

const camTheme: Record<StatusLevel, {
  gradient: string; glow: string; scanColor: string;
  badge: string; badgeText: string; dot: string; label: string;
}> = {
  normal: {
    gradient: 'from-[#0f2027] via-[#203a43] to-[#2c5364]',
    glow: 'shadow-[0_0_40px_rgba(34,197,94,0.15)]',
    scanColor: 'rgba(34,197,94,0.4)',
    badge: 'bg-[#22C55E]/20 text-[#4ade80] border border-[#22C55E]/30',
    badgeText: 'Normal',
    dot: '#22C55E',
    label: 'STABLE',
  },
  warning: {
    gradient: 'from-[#1a0a00] via-[#3d1f00] to-[#5c3200]',
    glow: 'shadow-[0_0_40px_rgba(245,158,11,0.2)]',
    scanColor: 'rgba(245,158,11,0.4)',
    badge: 'bg-[#F59E0B]/20 text-[#fbbf24] border border-[#F59E0B]/30',
    badgeText: 'Warning',
    dot: '#F59E0B',
    label: 'CAUTION',
  },
  danger: {
    gradient: 'from-[#1a0000] via-[#3d0000] to-[#5c0000]',
    glow: 'shadow-[0_0_60px_rgba(239,68,68,0.35)]',
    scanColor: 'rgba(239,68,68,0.5)',
    badge: 'bg-[#EF4444]/20 text-[#f87171] border border-[#EF4444]/30 blink',
    badgeText: 'DANGER',
    dot: '#EF4444',
    label: 'ALERT',
  },
};

function metricsToLevel(redness: number, paleness: number, eye_closure: number): StatusLevel {
  if (eye_closure > 0.7 || redness >= 0.70 || paleness < 0.38) return 'danger';
  if (eye_closure > 0.4 || redness >= 0.63 || paleness < 0.45) return 'warning';
  return 'normal';
}


function CamCard({ title, subtitle, level, live, body, sos }: { title: string; subtitle: string; level: StatusLevel; live?: boolean; body?: boolean; sos?: boolean }) {
  const th = camTheme[level];
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${th.gradient} ${th.glow} transition-all duration-700`}>
      <div className={`h-0.5 w-full ${level === 'normal' ? 'bg-gradient-to-r from-transparent via-[#22C55E] to-transparent' : level === 'warning' ? 'bg-gradient-to-r from-transparent via-[#F59E0B] to-transparent' : 'bg-gradient-to-r from-transparent via-[#EF4444] to-transparent'}`} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.15em]">{subtitle}</p>
            <p className="text-white font-bold text-lg leading-tight tracking-tight">{title}</p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm ${th.badge}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: th.dot, boxShadow: `0 0 6px ${th.dot}` }} />
            {th.badgeText}
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden aspect-video bg-black/40">
          {live && body ? (
            <AgoraBodyViewer />
          ) : live ? (
            <AgoraViewer />
          ) : (
            <>
              <div className="absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(${th.scanColor.replace('0.4', '0.06')} 1px, transparent 1px), linear-gradient(90deg, ${th.scanColor.replace('0.4', '0.06')} 1px, transparent 1px)`,
                  backgroundSize: '32px 32px',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="w-16 h-20 rounded-full border border-white/10 bg-white/5" />
                  <div className="absolute inset-0 rounded-full border animate-ping"
                    style={{ borderColor: th.dot, opacity: 0.2, animationDuration: '2s' }} />
                </div>
              </div>
              <div className="absolute inset-x-0 h-8 pointer-events-none"
                style={{
                  background: `linear-gradient(to bottom, transparent, ${th.scanColor}, transparent)`,
                  animation: 'scanline 3s ease-in-out infinite',
                }}
              />
            </>
          )}
          {[
            'top-3 left-3 border-t-2 border-l-2',
            'top-3 right-3 border-t-2 border-r-2',
            'bottom-3 left-3 border-b-2 border-l-2',
            'bottom-3 right-3 border-b-2 border-r-2',
          ].map((cls, i) => (
            <div key={i} className={`absolute w-5 h-5 ${cls}`}
              style={{ borderColor: th.dot, opacity: 0.7 }} />
          ))}
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 blink" />
            <span className="text-white/70 text-[9px] font-bold tracking-[0.2em]">LIVE</span>
          </div>
          <div className="absolute bottom-3 left-3">
            <span className="text-[9px] font-bold tracking-widest" style={{ color: th.dot }}>{th.label}</span>
          </div>

          {/* SOS 전화 버튼 — 웹캠 내부 오버레이 */}
          {sos && (
            <div className="absolute inset-0 flex items-end justify-end p-3 pointer-events-none">
              <a
                href="tel:119"
                className="pointer-events-auto flex items-center gap-2 bg-[#EF4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-white font-bold text-sm px-4 py-2.5 rounded-full shadow-lg blink transition-colors"
                style={{ boxShadow: '0 0 20px rgba(239,68,68,0.7)' }}
              >
                <Phone size={16} />
                119
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: th.dot, boxShadow: `0 0 8px ${th.dot}` }} />
          <span className="text-white/50 text-xs">AI 분석 중</span>
        </div>
      </div>
    </div>
  );
}

export default function MonitorPage() {
  const [faceLevel, setFaceLevel] = useState<StatusLevel>('normal');
  const [bodyLevel, setBodyLevel] = useState<StatusLevel>('normal');
  const [showSos, setShowSos] = useState(false);
  const dangerStartRef = useRef<number | null>(null);
  const bodyDangerStartRef = useRef<number | null>(null);
  const sosDismissedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const bodyChannel = supabase
      .channel('body-state')
      .on('broadcast', { event: 'body-state' }, (payload) => {
        const severity = payload.payload?.severity as string;
        if (severity === 'high') setBodyLevel('danger');
        else if (severity === 'medium') setBodyLevel('warning');
        else setBodyLevel('normal');
      })
      .subscribe();
    return () => { supabase.removeChannel(bodyChannel); };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('face_metrics')
      .select('redness, paleness, eye_closure')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const { redness, paleness, eye_closure } = data[0];
          setFaceLevel(metricsToLevel(redness, paleness, eye_closure));
        }
      });

    const channel = supabase
      .channel('monitor_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'face_metrics' },
        (payload) => {
          const { redness, paleness, eye_closure } = payload.new as { redness: number; paleness: number; eye_closure: number };
          setFaceLevel(metricsToLevel(redness, paleness, eye_closure));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // SOS: faceLevel 또는 bodyLevel danger 5초 지속 시 119 버튼
  useEffect(() => {
    if (faceLevel === 'danger') {
      if (dangerStartRef.current === null) {
        dangerStartRef.current = Date.now();
        sosDismissedRef.current = false;
      }
      if (!sosDismissedRef.current) {
        const remaining = 5000 - (Date.now() - dangerStartRef.current!);
        if (remaining <= 0) { setShowSos(true); }
        else { const t = setTimeout(() => setShowSos(true), remaining); return () => clearTimeout(t); }
      }
    } else {
      dangerStartRef.current = null;
      if (bodyDangerStartRef.current === null) setShowSos(false);
    }
  }, [faceLevel]);

  useEffect(() => {
    if (bodyLevel === 'danger') {
      if (bodyDangerStartRef.current === null) {
        bodyDangerStartRef.current = Date.now();
        sosDismissedRef.current = false;
      }
      if (!sosDismissedRef.current) {
        const remaining = 5000 - (Date.now() - bodyDangerStartRef.current!);
        if (remaining <= 0) { setShowSos(true); }
        else { const t = setTimeout(() => setShowSos(true), remaining); return () => clearTimeout(t); }
      }
    } else {
      bodyDangerStartRef.current = null;
      if (dangerStartRef.current === null) setShowSos(false);
    }
  }, [bodyLevel]);

  return (
    <div className="fade-in flex flex-col gap-4">
      <CamCard title="Body Camera" subtitle="신체 모니터링" level={bodyLevel} live body />
      <CamCard title="Face Camera" subtitle="얼굴 모니터링" level={faceLevel} live sos={showSos} />
    </div>
  );
}
