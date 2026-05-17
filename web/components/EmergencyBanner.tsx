'use client';

import { PhoneCall, X, AlertTriangle } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface Props {
  type: 'stroke' | 'heatstroke';
  onDismiss: () => void;
}

const CFG = {
  stroke:     { labelKey: 'strokeDetected', descKey: 'strokeDesc' },
  heatstroke: { labelKey: 'heatstrokeDetected', descKey: 'heatstrokeDesc' },
} as const;

export default function EmergencyBanner({ type, onDismiss }: Props) {
  const t = useT();
  const cfg = CFG[type];

  return (
    <div className="slide-down fixed top-0 left-0 right-0 z-[100] bg-[#EF4444] text-white shadow-2xl">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="pulse-ring w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <AlertTriangle size={20} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm blink">🚨 {t(cfg.labelKey)}</p>
          <p className="text-xs text-red-100 truncate">{t(cfg.descKey)}</p>
        </div>

        <a
          href="tel:119"
          className="flex items-center gap-2 bg-white text-[#EF4444] font-bold text-sm px-4 py-2 rounded-full hover:bg-red-50 transition-colors shrink-0"
        >
          <PhoneCall size={16} />
          {t('sosEmergencyCall')}
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
