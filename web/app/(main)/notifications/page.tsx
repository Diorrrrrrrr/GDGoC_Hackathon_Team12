'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Thermometer, User, Activity, Bell, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface RawMetric {
  id: string;
  redness: number;
  paleness: number;
  eye_closure: number;
  created_at: string;
}

interface Notification {
  id: string;
  timestamp: string;
  type: 'stroke' | 'heatstroke' | 'pale';
  message: string;
  level: 'danger' | 'warning';
}

const typeConfig = {
  stroke:     { icon: Activity,      label: '눈감김 이상',   dangerMsg: '눈감김이 위험 수준으로 감지되었습니다. 즉시 확인이 필요합니다.', warningMsg: '눈감김이 주의 수준으로 감지되었습니다.' },
  heatstroke: { icon: Thermometer,   label: '홍조 감지',     dangerMsg: '홍조가 위험 수준입니다. 열사병 위험이 있습니다.', warningMsg: '홍조가 주의 수준입니다.' },
  pale:       { icon: User,          label: '안색 창백',     dangerMsg: '얼굴이 위험 수준으로 창백합니다. 즉시 확인이 필요합니다.', warningMsg: '얼굴이 다소 창백한 상태입니다.' },
};

const levelStyle = {
  danger:  { border: 'border-l-[#EF4444]', dot: 'bg-[#EF4444]', iconCls: 'bg-[#FEE2E2] text-[#EF4444]' },
  warning: { border: 'border-l-[#F59E0B]', dot: 'bg-[#F59E0B]', iconCls: 'bg-[#FEF3C7] text-[#F59E0B]' },
};

function metricsToAlerts(rows: RawMetric[]): Notification[] {
  const alerts: Notification[] = [];
  const WINDOW_MS = 2 * 60 * 1000;

  let lastAlertTime: Record<string, number> = {};

  for (const row of rows) {
    const ts = new Date(row.created_at).getTime();
    const checks: { key: string; type: Notification['type']; level: 'danger' | 'warning' }[] = [];

    if (row.eye_closure > 0.7)       checks.push({ key: 'stroke-danger',     type: 'stroke',     level: 'danger' });
    else if (row.eye_closure > 0.4)  checks.push({ key: 'stroke-warning',    type: 'stroke',     level: 'warning' });

    if (row.redness >= 0.70)         checks.push({ key: 'heat-danger',       type: 'heatstroke', level: 'danger' });
    else if (row.redness >= 0.63)    checks.push({ key: 'heat-warning',      type: 'heatstroke', level: 'warning' });

    if (row.paleness < 0.38)         checks.push({ key: 'pale-danger',       type: 'pale',       level: 'danger' });
    else if (row.paleness < 0.45)    checks.push({ key: 'pale-warning',      type: 'pale',       level: 'warning' });

    for (const { key, type, level } of checks) {
      const last = lastAlertTime[key] ?? 0;
      if (ts - last > WINDOW_MS) {
        const cfg = typeConfig[type];
        alerts.push({
          id: `${row.id}-${key}`,
          timestamp: row.created_at,
          type,
          level,
          message: level === 'danger' ? cfg.dangerMsg : cfg.warningMsg,
        });
        lastAlertTime[key] = ts;
      }
    }
  }

  return alerts;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function NotifCard({ n, unread }: { n: Notification; unread: boolean }) {
  const cfg = typeConfig[n.type];
  const Icon = cfg.icon;
  const style = levelStyle[n.level];

  if (!unread) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-[#F1F5F9] flex gap-4 items-start opacity-60">
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
  }

  return (
    <div className={`bg-white rounded-2xl p-4 border border-[#E2E8F0] border-l-4 shadow-sm ${style.border} flex gap-4 items-start`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${style.iconCls}`}>
        <Icon size={16} strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-bold text-[#0F172A]">{cfg.label}</span>
          <span className="text-xs text-[#94A3B8] shrink-0">{timeAgo(n.timestamp)}</span>
        </div>
        <p className="text-sm text-[#475569] leading-snug">{n.message}</p>
      </div>
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 blink ${style.dot}`} />
    </div>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const UNREAD_CUTOFF = 10 * 60 * 1000;

    async function fetch() {
      const { data } = await supabase
        .from('face_metrics')
        .select('id, redness, paleness, eye_closure, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (data) {
        const alerts = metricsToAlerts(data as RawMetric[]);
        setNotifications(alerts);
      }
      setLoaded(true);
    }

    fetch();

    const channel = supabase
      .channel('notif_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'face_metrics' }, () => {
        fetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const now = Date.now();
  const UNREAD_CUTOFF = 10 * 60 * 1000;
  const unread = notifications.filter(n => now - new Date(n.timestamp).getTime() < UNREAD_CUTOFF);
  const read = notifications.filter(n => now - new Date(n.timestamp).getTime() >= UNREAD_CUTOFF);

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

      {unread.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">새 알림</p>
          <div className="flex flex-col gap-2">
            {unread.map(n => <NotifCard key={n.id} n={n} unread={true} />)}
          </div>
        </div>
      )}

      {read.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCheck size={14} className="text-[#94A3B8]" />
            <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">이전 알림</p>
          </div>
          <div className="flex flex-col gap-2">
            {read.map(n => <NotifCard key={n.id} n={n} unread={false} />)}
          </div>
        </div>
      )}

      {loaded && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
          <Bell size={40} strokeWidth={1.5} className="mb-3" />
          <p className="font-semibold">알림이 없습니다</p>
          <p className="text-sm mt-1">위험 상태 감지 시 여기에 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
