import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import type { StatusLevel } from '@/lib/types';

interface StatusItem {
  key: string;
  label: string;
  level: StatusLevel;
  active: boolean;
}

interface Props {
  title: string;
  icon: React.ReactNode;
  items: StatusItem[];
}

const levelConfig: Record<StatusLevel, { icon: typeof CheckCircle2; cls: string; dot: string }> = {
  normal:  { icon: CheckCircle2, cls: 'status-normal',  dot: 'bg-[#22C55E]' },
  warning: { icon: AlertCircle,  cls: 'status-warning', dot: 'bg-[#F59E0B]' },
  danger:  { icon: XCircle,      cls: 'status-danger',  dot: 'bg-[#EF4444]' },
};

function StatusPill({ label, level, active }: { label: string; level: StatusLevel; active: boolean }) {
  const cfg = levelConfig[level];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
      active ? cfg.cls : 'bg-[#F1F5F9] text-[#94A3B8] border border-[#E2E8F0]'
    }`}>
      {active ? (
        <Icon size={15} strokeWidth={2.5} />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-[#CBD5E1]" />
      )}
      {label}
    </div>
  );
}

export default function StatusCard({ title, icon, items }: Props) {
  const active = items.find((i) => i.active);
  const currentLevel = active?.level ?? 'normal';
  const cfg = levelConfig[currentLevel];

  return (
    <div className={`bg-white rounded-2xl p-4 border-2 transition-all duration-500 ${
      currentLevel === 'danger'
        ? 'border-[#EF4444] shadow-[0_0_20px_rgba(239,68,68,0.15)]'
        : currentLevel === 'warning'
        ? 'border-[#F59E0B] shadow-sm'
        : 'border-[#E2E8F0] shadow-sm'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            currentLevel === 'danger' ? 'bg-[#FEE2E2] text-[#EF4444]'
            : currentLevel === 'warning' ? 'bg-[#FEF3C7] text-[#F59E0B]'
            : 'bg-[#EFF6FF] text-[#1D6FD8]'
          }`}>
            {icon}
          </div>
          <span className="font-bold text-sm text-[#0F172A]">{title}</span>
        </div>

        {active && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${currentLevel === 'danger' ? 'blink' : ''}`} />
            {active.label}
          </div>
        )}
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <StatusPill key={item.key} label={item.label} level={item.level} active={item.active} />
        ))}
      </div>
    </div>
  );
}
