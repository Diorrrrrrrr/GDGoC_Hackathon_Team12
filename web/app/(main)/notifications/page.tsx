'use client';

import { mockNotifications } from '@/lib/mockData';
import { AlertTriangle, Thermometer, User, Activity, Bell, CheckCheck } from 'lucide-react';

const typeConfig = {
  stroke:     { icon: Activity,      label: '뇌졸중 감지',       cls: 'bg-[#FEE2E2] text-[#EF4444]', border: 'border-l-[#EF4444]' },
  heatstroke: { icon: Thermometer,   label: '열사병 감지',       cls: 'bg-[#FEF3C7] text-[#F59E0B]', border: 'border-l-[#F59E0B]' },
  pale:       { icon: User,          label: '얼굴 창백',         cls: 'bg-[#FEF3C7] text-[#F59E0B]', border: 'border-l-[#F59E0B]' },
  swing:      { icon: AlertTriangle, label: '신체 흔들림',       cls: 'bg-[#FEF3C7] text-[#F59E0B]', border: 'border-l-[#F59E0B]' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function NotificationsPage() {
  const unread = mockNotifications.filter((n) => !n.read);
  const read   = mockNotifications.filter((n) => n.read);

  return (
    <div className="flex flex-col gap-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">알림</h1>
          <p className="text-sm text-[#64748B] mt-0.5">위험 감지 이벤트 알림을 확인합니다.</p>
        </div>
        {unread.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FEE2E2] rounded-full">
            <Bell size={13} className="text-[#EF4444]" />
            <span className="text-xs font-bold text-[#EF4444]">읽지 않음 {unread.length}</span>
          </div>
        )}
      </div>

      {/* Unread */}
      {unread.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">새 알림</p>
          <div className="flex flex-col gap-2">
            {unread.map((n) => {
              const cfg = typeConfig[n.type];
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className={`bg-white rounded-2xl p-4 border border-[#E2E8F0] border-l-4 shadow-sm ${cfg.border} flex gap-4 items-start`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.cls}`}>
                    <Icon size={16} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-bold text-[#0F172A]">{cfg.label}</span>
                      <span className="text-xs text-[#94A3B8] shrink-0">{timeAgo(n.timestamp)}</span>
                    </div>
                    <p className="text-sm text-[#475569] leading-snug">{n.message}</p>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] shrink-0 mt-1.5 blink" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Read */}
      {read.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCheck size={14} className="text-[#94A3B8]" />
            <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">읽은 알림</p>
          </div>
          <div className="flex flex-col gap-2">
            {read.map((n) => {
              const cfg = typeConfig[n.type];
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className="bg-white rounded-2xl p-4 border border-[#F1F5F9] flex gap-4 items-start opacity-60"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#F1F5F9] flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-[#94A3B8]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-[#64748B]">{cfg.label}</span>
                      <span className="text-xs text-[#94A3B8] shrink-0">{timeAgo(n.timestamp)}</span>
                    </div>
                    <p className="text-sm text-[#94A3B8] leading-snug">{n.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mockNotifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
          <Bell size={40} strokeWidth={1.5} className="mb-3" />
          <p className="font-semibold">알림이 없습니다</p>
          <p className="text-sm mt-1">위험 상태 감지 시 여기에 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
