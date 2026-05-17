'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Shield, AlertTriangle, XOctagon, Wifi } from 'lucide-react';
import type { StatusLevel } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { useT, bodyStateKey } from '@/lib/i18n';

interface DataPoint {
  t: number;
  label: string;
  face: number;
  redness: number;
  paleness: number;
  eye_closure: number;
}

interface BodyEvent {
  id: string;
  state: string;
  severity: string;
  risk_score: number;
  created_at: string;
}

const WINDOW = 30;

function metricsToScore(redness: number, paleness: number, eye_closure: number): number {
  if (eye_closure > 0.7 || redness >= 0.70 || paleness < 0.38) return 3;
  if (eye_closure > 0.4 || redness >= 0.63 || paleness < 0.45) return 2;
  return 1;
}

function scoreToLevel(s: number): StatusLevel {
  if (s >= 2.5) return 'danger';
  if (s >= 1.5) return 'warning';
  return 'normal';
}

const levelCfg = {
  normal:  { color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  text: '#16A34A', icon: Shield        },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#D97706', icon: AlertTriangle  },
  danger:  { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#DC2626', icon: XOctagon       },
};

const levelLabelKey = { normal: 'levelNormal', warning: 'levelWarning', danger: 'levelDanger' } as const;

const SEVERITY_LEVEL: Record<string, StatusLevel> = {
  low: 'normal', medium: 'warning', high: 'danger',
};

function Gauge({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const arc = circ * Math.min(1, Math.max(0, value));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx={32} cy={32} r={r} fill="none" stroke="#F1F5F9" strokeWidth={6} />
          <circle
            cx={32} cy={32} r={r} fill="none"
            stroke={color} strokeWidth={6}
            strokeDasharray={`${arc} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-bold" style={{ color }}>
            {Math.round(value * 100)}
          </span>
        </div>
      </div>
      <span className="text-[11px] font-semibold text-[#94A3B8] tracking-wide">{label}</span>
    </div>
  );
}

function StatusCard({ level, title, sub }: { level: StatusLevel; title: string; sub?: string }) {
  const t = useT();
  const cfg = levelCfg[level];
  const Icon = cfg.icon;
  return (
    <div
      className="flex-1 rounded-2xl p-4 flex flex-col gap-3 border"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>{title}</span>
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: cfg.color + '22' }}>
          <Icon size={13} style={{ color: cfg.color }} strokeWidth={2.5} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-black" style={{ color: cfg.text }}>{t(levelLabelKey[level])}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: cfg.color + 'bb' }}>{sub}</p>}
      </div>
      <div className="h-1 rounded-full" style={{ background: cfg.color + '33' }}>
        <div
          className="h-full rounded-full"
          style={{
            background: cfg.color,
            width: level === 'normal' ? '30%' : level === 'warning' ? '65%' : '100%',
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, t }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F172A] rounded-xl px-3 py-2.5 shadow-xl border border-white/10 text-xs">
      <p className="text-white/40 mb-2 font-medium">{label === 'now' ? t('now') : t('ago', label)}</p>
      {[
        { color: '#a78bfa', label: t('riskScore'), v: payload[0]?.value },
        { color: '#f87171', label: t('redness'),   v: payload[1]?.value },
        { color: '#fbbf24', label: t('eyeClosed'), v: payload[2]?.value },
      ].map(({ color, label: l, v }) => (
        <div key={l} className="flex items-center gap-2 mb-0.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-white/60 flex-1">{l}</span>
          <span className="text-white font-bold">{typeof v === 'number' ? v.toFixed(2) : '-'}</span>
        </div>
      ))}
    </div>
  );
}

function EventItem({ event }: { event: BodyEvent }) {
  const t = useT();
  const level = SEVERITY_LEVEL[event.severity] ?? 'normal';
  const cfg = levelCfg[level];
  const time = new Date(event.created_at).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-[#F8FAFC] last:border-0">
      <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#0F172A] truncate">{t(bodyStateKey(event.state))}</p>
        <p className="text-[11px] text-[#94A3B8] mt-0.5">{time}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-black" style={{ color: cfg.color }}>{(event.risk_score * 100).toFixed(0)}%</p>
        <p className="text-[10px] text-[#CBD5E1] uppercase tracking-wide">{event.severity}</p>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const t = useT();
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [bodyLevel, setBodyLevel] = useState<StatusLevel>('normal');
  const [bodyEvents, setBodyEvents] = useState<BodyEvent[]>([]);
  const [lastBodyState, setLastBodyState] = useState('—');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setData(Array.from({ length: WINDOW + 1 }, (_, i) => ({
      t: WINDOW - i, label: WINDOW - i === 0 ? 'now' : `${WINDOW - i}s`,
      face: 1, redness: 0, paleness: 0.5, eye_closure: 0,
    })));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel('body-state-analysis')
      .on('broadcast', { event: 'body-state' }, ({ payload }) => {
        const s = payload?.severity as string;
        setBodyLevel(s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'normal');
        if (payload?.state) setLastBodyState(t(bodyStateKey(payload.state)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [t]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('body_events')
      .select('id, state, severity, risk_score, created_at')
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data: rows }) => { if (rows) setBodyEvents(rows as BodyEvent[]); });

    const ch = supabase.channel('body_events_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'body_events' }, ({ new: row }) => {
        const ev = row as BodyEvent;
        setBodyEvents(prev => [ev, ...prev].slice(0, 15));
        setBodyLevel(SEVERITY_LEVEL[ev.severity] ?? 'normal');
        setLastBodyState(t(bodyStateKey(ev.state)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [t]);

  useEffect(() => {
    if (!isLive) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    const supabase = createClient();
    async function tick() {
      const { data: rows } = await supabase
        .from('face_metrics')
        .select('redness, paleness, eye_closure')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!rows?.length) return;
      const { redness, paleness, eye_closure } = rows[0];
      const face = metricsToScore(redness, paleness, eye_closure);
      setData(prev => {
        if (!prev.length) return prev;
        const shifted = prev.slice(1).map((d, i) => ({
          ...d, t: WINDOW - i - 1, label: WINDOW - i - 1 === 0 ? 'now' : `${WINDOW - i - 1}s`,
        }));
        return [...shifted, { t: 0, label: 'now', face: +face.toFixed(2), redness, paleness, eye_closure }];
      });
    }
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isLive]);

  if (!data.length) return null;

  const cur = data[data.length - 1];
  const faceLevel = scoreToLevel(cur.face);

  return (
    <div className="flex flex-col gap-5 fade-in pb-2">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-black text-[#0F172A] tracking-tight">{t('analysis')}</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5 font-medium">{t('realtimeRecent30s')}</p>
        </div>
        <button
          onClick={() => setIsLive(v => !v)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold transition-all border ${
            isLive
              ? 'bg-[#DCFCE7] text-[#15803D] border-[#22C55E]/30'
              : 'bg-[#F8FAFC] text-[#94A3B8] border-[#E2E8F0]'
          }`}
        >
          <Wifi size={12} strokeWidth={2.5} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>
      </div>

      <div className="flex gap-3">
        <StatusCard level={faceLevel} title={t('face')} sub="Face CV" />
        <StatusCard level={bodyLevel} title={t('body')} sub={lastBodyState} />
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm px-4 py-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#CBD5E1] mb-5">{t('faceBiometrics')}</p>
        <div className="flex justify-around">
          <Gauge value={cur.redness}     color="#f87171" label={t('redness')} />
          <Gauge value={1 - cur.paleness} color="#94a3b8" label={t('paleness')} />
          <Gauge value={cur.eye_closure} color="#fbbf24" label={t('eyeClosure')} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-[#0F172A]">{t('riskTrend30s')}</p>
          <div className="flex items-center gap-3 text-[10px] text-[#CBD5E1] font-semibold">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#a78bfa] inline-block rounded" />{t('riskScore')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f87171] inline-block rounded" />{t('redness')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#fbbf24] inline-block rounded" />{t('eyeClosed')}</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F8FAFC" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#CBD5E1' }} axisLine={false} tickLine={false} interval={4} />
            <YAxis domain={[0.8, 3.2]} ticks={[1, 2, 3]} tick={{ fontSize: 10, fill: '#CBD5E1' }} axisLine={false} tickLine={false} />
            <ReferenceLine y={1.5} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.35} />
            <ReferenceLine y={2.5} stroke="#EF4444" strokeDasharray="4 4" strokeOpacity={0.35} />
            <Tooltip content={(props: any) => <ChartTooltip {...props} t={t} />} />
            <Line isAnimationActive={false} type="monotone" dataKey="face"        stroke="#a78bfa" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#a78bfa' }} />
            <Line isAnimationActive={false} type="monotone" dataKey="redness"     stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            <Line isAnimationActive={false} type="monotone" dataKey="eye_closure" stroke="#fbbf24" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between">
          <p className="text-sm font-bold text-[#0F172A]">{t('bodyEvents')}</p>
          <span className="text-[10px] font-bold text-[#CBD5E1] uppercase tracking-widest">{t('recentCount', bodyEvents.length)}</span>
        </div>
        {bodyEvents.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#CBD5E1]">{t('noEvents')}</div>
        ) : (
          bodyEvents.map(ev => <EventItem key={ev.id} event={ev} />)
        )}
      </div>

    </div>
  );
}
