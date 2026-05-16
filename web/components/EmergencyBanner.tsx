'use client';

import { PhoneCall, X, AlertTriangle } from 'lucide-react';

interface Props {
  type: 'stroke' | 'heatstroke';
  onDismiss: () => void;
}

const CONFIG = {
  stroke: {
    label: '뇌졸중(Stroke) 감지',
    desc: '신체에서 뇌졸중 증상이 감지되었습니다. 즉시 응급 조치가 필요합니다.',
  },
  heatstroke: {
    label: '열사병(Heat Stroke) 감지',
    desc: '위험한 체온 상승이 감지되었습니다. 즉시 응급 조치가 필요합니다.',
  },
};

export default function EmergencyBanner({ type, onDismiss }: Props) {
  const cfg = CONFIG[type];

  return (
    <div className="slide-down fixed top-0 left-0 right-0 z-[100] bg-[#EF4444] text-white shadow-2xl">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="pulse-ring w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <AlertTriangle size={20} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm blink">🚨 {cfg.label}</p>
          <p className="text-xs text-red-100 truncate">{cfg.desc}</p>
        </div>

        <a
          href="tel:119"
          className="flex items-center gap-2 bg-white text-[#EF4444] font-bold text-sm px-4 py-2 rounded-full hover:bg-red-50 transition-colors shrink-0"
        >
          <PhoneCall size={16} />
          119 응급 전화
        </a>

        <button
          onClick={onDismiss}
          className="p-1.5 rounded-full hover:bg-white/20 transition-colors shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
