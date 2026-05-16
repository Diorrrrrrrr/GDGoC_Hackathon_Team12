'use client';

import { Video, VideoOff, Phone } from 'lucide-react';
import type { StatusLevel } from '@/lib/types';

interface Props {
  title: string;
  subtitle: string;
  level: StatusLevel;
  active?: boolean;
}

const borderClass: Record<StatusLevel, string> = {
  normal:  'cam-normal',
  warning: 'cam-warning',
  danger:  'cam-danger',
};

const dotClass: Record<StatusLevel, string> = {
  normal:  'bg-[#22C55E]',
  warning: 'bg-[#F59E0B]',
  danger:  'bg-[#EF4444] blink',
};

const scanColor: Record<StatusLevel, string> = {
  normal:  'from-[#22C55E]/0 via-[#22C55E]/20 to-[#22C55E]/0',
  warning: 'from-[#F59E0B]/0 via-[#F59E0B]/20 to-[#F59E0B]/0',
  danger:  'from-[#EF4444]/0 via-[#EF4444]/20 to-[#EF4444]/0',
};

export default function CameraFeed({ title, subtitle, level, active = true }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* Camera box */}
      <div
        className={`relative w-full aspect-video rounded-2xl border-2 overflow-hidden bg-[#0F172A] transition-all duration-500 ${borderClass[level]}`}
      >
        {active ? (
          <>
            {/* Fake video feed background */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A]" />

            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />

            {/* Scan line */}
            <div className={`absolute inset-x-0 h-16 bg-gradient-to-b ${scanColor[level]} animate-[scanline_3s_ease-in-out_infinite]`}
              style={{ animation: 'scanline 3s ease-in-out infinite' }}
            />

            {/* Center silhouette placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-28 rounded-full bg-white/5 border border-white/10" />
            </div>

            {/* Corner brackets */}
            {['top-2 left-2 border-t-2 border-l-2', 'top-2 right-2 border-t-2 border-r-2',
              'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map((cls, i) => (
              <div key={i} className={`absolute w-5 h-5 border-[#22C55E] opacity-60 ${cls}`} />
            ))}

            {/* Top-left label */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 rounded-md px-2 py-1 backdrop-blur-sm">
              <span className={`w-2 h-2 rounded-full ${dotClass[level]}`} />
              <span className="text-white text-xs font-semibold uppercase tracking-wider">{title}</span>
            </div>

            {/* REC */}
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 rounded-md px-2 py-1 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] blink" />
              <span className="text-white text-[10px] font-bold tracking-widest">REC</span>
            </div>

            {/* Bottom timestamp */}
            <div className="absolute bottom-3 left-3 text-white/50 text-[10px] font-mono">
              {new Date().toLocaleTimeString('ko-KR')}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#475569]">
            <VideoOff size={32} strokeWidth={1.5} />
            <span className="text-sm font-medium">카메라 연결 안됨</span>
          </div>
        )}

        {/* Video call button */}
        <button
          title="영상 통화"
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-[#1D6FD8] hover:bg-[#1558B0] flex items-center justify-center shadow-lg transition-colors"
        >
          <Phone size={15} className="text-white" />
        </button>
      </div>

      {/* Label below cam */}
      <div className="flex items-center gap-2 px-1">
        <Video size={14} className="text-[#64748B]" />
        <span className="text-sm font-semibold text-[#0F172A]">{title}</span>
        <span className="text-xs text-[#64748B]">{subtitle}</span>
      </div>
    </div>
  );
}
