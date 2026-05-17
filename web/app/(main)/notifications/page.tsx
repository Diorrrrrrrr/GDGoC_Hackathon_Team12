'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Thermometer, User, Activity, Bell, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useT, bodyStateKey } from '@/lib/i18n';

interface RawMetric {
  id: string;
  redness: number;
  paleness: number;
  eye_closure: number;
  created_at: string;
}

interface RawBodyEvent {
  id: string;
  state: string;
  severity: string;
  created_at: string;
}

type AlertType = 'stroke' | 'heatstroke' | 'pale' | 'body';
type AlertLevel = 'danger' | 'warning';
type MsgKey =
  | 'notifStrokeDanger' | 'notifStrokeWarning'
  | 'notifHeatDanger' | 'notifHeatWarning'
  | 'notifPaleDanger' | 'notifPaleWarning'
  | 'bodyImmediate' | 'bodyDetected';

interface Notification {
  id: string;
  timestamp: string;
  type: AlertType;
  level: AlertLevel;
  messageKey: MsgKey;
  messageArg?: string;
}

const typeIcon: Record<AlertType, { icon: any; labelKey: 'notifStroke' | 'notifHeat' | 'notifPale' | 'notifBody' }> = {
  stroke:     { icon: Activity,      labelKey: 'notifStroke' },
  heatstroke: { icon: Thermometer,   labelKey: 'notifHeat' },
  pale:       { icon: User,          labelKey: 'notifPale' },
  body:       { icon: AlertTriangle, labelKey: 'notifBody' },
};

const levelStyle = {
  danger:  { border: 'border-l-[#EF4444]', dot: 'bg-[#EF4444]', iconCls: 'bg-[#FEE2E2] text-[#EF4444]' },
  warning: { border: 'border-l-[#F59E0B]', dot: 'bg-[#F59E0B]', iconCls: 'bg-[#FEF3C7] text-[#F59E0B]' },
};

function metricsToAlerts(rows: RawMetric[]): Notification[] {
  const alerts: Notification[] = [];
  const WINDOW_MS = 2 * 60 * 1000;
  const lastAlertTime: Record<string, number> = {};

  for (const row of rows) {
    const ts = new Date(row.created_at).getTime();
    const checks: { key: string; type: AlertType; level: AlertLevel; messageKey: MsgKey }[] = [];

    if (row.eye_closure > 0.7)       checks.push({ key: 'stroke', type: 'stroke', level: 'danger',  messageKey: 'notifStrokeDanger' });
    else if (row.eye_closure > 0.4)  checks.push({ key: 'stroke', type: 'stroke', level: 'warning', messageKey: 'notifStrokeWarning' });

    if (row.redness >= 0.70)         checks.push({ key: 'heat', type: 'heatstroke', level: 'danger',  messageKey: 'notifHeatDanger' });
    else if (row.redness >= 0.63)    checks.push({ key: 'heat', type: 'heatstroke', level: 'warning', messageKey: 'notifHeatWarning' });

    if (row.paleness < 0.38)         checks.push({ key: 'pale', type: 'pale', level: 'danger',  messageKey: 'notifPaleDanger' });
    else if (row.paleness < 0.45)    checks.push({ key: 'pale', type: 'pale', level: 'warning', messageKey: 'notifPaleWarning' });

    for (const { key, type, level, messageKey } of checks) {
      const last = lastAlertTime[key] ?? 0;
      if (ts - last > WINDOW_MS) {
        alerts.push({ id: `${row.id}-${key}`, timestamp: row.created_at, type, level, messageKey });
        lastAlertTime[key] = ts;
      }
    }
  }
  return alerts;
}

function useTimeAgo() {
  const t = useT();
  return (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('justNow');
    if (m < 60) return t('minAgo', m);
    const h = Math.floor(m / 60);
    if (h < 24) return t('hourAgo', h);
    return t('dayAgo', Math.floor(h / 24));
  };
}

function NotifCard({ n, unread }: { n: Notification; unread: boolean }) {
  const t = useT();
  const timeAgo = useTimeAgo();
  const cfg = typeIcon[n.type];
  const Icon = cfg.icon;
  const style = levelStyle[n.level];
  const message = n.messageArg
    ? t(n.messageKey, t(bodyStateKey(n.messageArg)))
    : t(n.messageKey);

  if (!unread) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-[#F1F5F9] flex gap-4 items-start opacity-60">
        <div className="w-9 h-9 rounded-xl bg-[#F1F5F9] flex items-center justify-center shrink-0">
          <Icon size={16} className="text-[#94A3B8]" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-[#64748B]">{t(cfg.labelKey)}</span>
            <span className="text-xs text-[#94A3B8] shrink-0">{timeAgo(n.timestamp)}</span>
          </div>
          <p className="text-sm text-[#94A3B8] leading-snug">{message}</p>
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
          <span className="text-sm font-bold text-[#0F172A]">{t(cfg.labelKey)}</span>
          <span className="text-xs text-[#94A3B8] shrink-0">{timeAgo(n.timestamp)}</span>
        </div>
        <p className="text-sm text-[#475569] leading-snug">{message}</p>
      </div>
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 blink ${style.dot}`} />
    </div>
  );
}

const STORAGE_KEY = 'carewatch_read_notifs';

function loadReadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')); }
  catch { return new Set(); }
}

function saveReadIds(ids: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch {}
}

export default function NotificationsPage() {
  const t = useT();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setReadIds(loadReadIds()); }, []);

  function markRead(id: string) {
    setReadIds(prev => {
      const next = new Set([...prev, id]);
      saveReadIds(next);
      return next;
    });
  }

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const [{ data: faceData }, { data: bodyData }] = await Promise.all([
        supabase
          .from('face_metrics')
          .select('id, redness, paleness, eye_closure, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('body_events')
          .select('id, state, severity, created_at')
          .neq('state', 'NORMAL')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      const faceAlerts = metricsToAlerts((faceData ?? []) as RawMetric[]);
      const bodyAlerts: Notification[] = ((bodyData ?? []) as RawBodyEvent[]).map(ev => ({
        id: `body-${ev.id}`,
        timestamp: ev.created_at,
        type: 'body',
        level: ev.severity === 'high' ? 'danger' : 'warning',
        messageKey: ev.severity === 'high' ? 'bodyImmediate' : 'bodyDetected',
        messageArg: ev.state,
      }));

      const all = [...faceAlerts, ...bodyAlerts]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setNotifications(all);
      setLoaded(true);
    }

    load();

    const ch = supabase.channel('notif_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'face_metrics' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'body_events' }, load)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const now = Date.now();
  const UNREAD_CUTOFF = 10 * 60 * 1000;
  const unread = notifications.filter(n => !readIds.has(n.id) && now - new Date(n.timestamp).getTime() < UNREAD_CUTOFF);
  const read = notifications.filter(n => readIds.has(n.id) || now - new Date(n.timestamp).getTime() >= UNREAD_CUTOFF);

  return (
    <div className="flex flex-col gap-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">{t('notifications')}</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{t('notificationsSub')}</p>
        </div>
        {unread.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FEE2E2] rounded-full">
            <Bell size={13} className="text-[#EF4444]" />
            <span className="text-xs font-bold text-[#EF4444]">{t('unreadCount', unread.length)}</span>
          </div>
        )}
      </div>

      {unread.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">{t('newAlerts')}</p>
          <div className="flex flex-col gap-2">
            {unread.map(n => (
              <div key={n.id} onClick={() => markRead(n.id)} className="cursor-pointer">
                <NotifCard n={n} unread={true} />
              </div>
            ))}
          </div>
        </div>
      )}

      {read.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCheck size={14} className="text-[#94A3B8]" />
            <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">{t('oldAlerts')}</p>
          </div>
          <div className="flex flex-col gap-2">
            {read.map(n => <NotifCard key={n.id} n={n} unread={false} />)}
          </div>
        </div>
      )}

      {loaded && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
          <Bell size={40} strokeWidth={1.5} className="mb-3" />
          <p className="font-semibold">{t('noAlerts')}</p>
          <p className="text-sm mt-1">{t('showOnDanger')}</p>
        </div>
      )}
    </div>
  );
}
