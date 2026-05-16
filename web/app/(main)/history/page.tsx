'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Activity, Shield, AlertTriangle, XOctagon, Clock, Wifi } from 'lucide-react';
import type { StatusLevel } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface DataPoint {
  t: number;
  label: string;
  face: number;
  redness: number;
  paleness: number;
  eye_closure: number;
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

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1E293B] rounded-xl px-3 py-2.5 shadow-xl border border-white/10 text-xs">
      <p className="text-white/50 mb-1.5">{label === 'now' ? '현재' : `${label} 전`}</p>
      <div className="flex flex-col gap-1">
        {[
          ['#f472b6', '얼굴 상태', payload[0]?.value],
          ['#f87171', '홍조', payload[1]?.value],
          ['#94a3b8', '창백', payload[2]?.value],
          ['#fbbf24', '눈 감김', payload[3]?.value],
        ].map(([c, l, v]) => (
          <div key={l as string} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: c as string }} />
            <span className="text-white/70">{l as string}</span>
            <span className="text-white font-bold ml-auto pl-3">{typeof v === 'number' ? v.toFixed(2) : '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const levelCfg = {
  normal:  { label: '정상', color: '#22C55E', bg: '#DCFCE7', text: '#15803D', icon: Shield },
  warning: { label: '주의', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E', icon: AlertTriangle },
  danger:  { label: '위험', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B', icon: XOctagon },
};

function StatusBadge({ level, title }: { level: StatusLevel; title: string }) {
  const cfg = levelCfg[level];
  const Icon = cfg.icon;
  return (
    <div className="flex-1 rounded-2xl p-4 flex flex-col gap-2" style={{ background: cfg.bg }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.text }}>{title}</span>
        <Icon size={14} style={{ color: cfg.color }} strokeWidth={2.5} />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
        <span className="text-lg font-bold" style={{ color: cfg.text }}>{cfg.label}</span>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const empty: DataPoint[] = Array.from({ length: WINDOW + 1 }, (_, i) => ({
      t: WINDOW - i,
      label: WINDOW - i === 0 ? 'now' : `${WINDOW - i}s`,
      face: 1, redness: 0, paleness: 0, eye_closure: 0,
    }));
    setData(empty);
  }, []);

  useEffect(() => {
    if (!isLive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const supabase = createClient();

    async function fetchLatest() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rows } = await supabase
        .from('face_metrics')
        .select('redness, paleness, eye_closure, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!rows || rows.length === 0) return;

      setHasRealData(true);
      const row = rows[0];
      const face = metricsToScore(row.redness, row.paleness, row.eye_closure);

      setData(prev => {
        if (prev.length === 0) return prev;
        const shifted = prev.slice(1).map((d, i) => ({
          ...d,
          t: WINDOW - i - 1,
          label: WINDOW - i - 1 === 0 ? 'now' : `${WINDOW - i - 1}s`,
        }));
        return [...shifted, {
          t: 0, label: 'now',
          face: +face.toFixed(2),
          redness: row.redness,
          paleness: row.paleness,
          eye_closure: row.eye_closure,
        }];
      });
    }

    intervalRef.current = setInterval(fetchLatest, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isLive]);

  if (data.length === 0) return null;

  const current = data[data.length - 1];
  const faceLevel = scoreToLevel(current.face);
  const worstFace = scoreToLevel(Math.max(...data.map(d => d.face)));

  return (
    <div className="flex flex-col gap-4 fade-in">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">실시간 분석</h1>
          <p className="text-sm text-[#64748B] mt-0.5">최근 30초 감지 데이터</p>
        </div>
        <button
          onClick={() => setIsLive(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            isLive ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#F1F5F9] text-[#64748B]'
          }`}
        >
          <Wifi size={12} strokeWidth={2.5} className={isLive ? 'text-[#22C55E]' : ''} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>
      </div>

      <div className="flex gap-3">
        <StatusBadge level={faceLevel} title="얼굴 (Face)" />
        <div className="flex-1 rounded-2xl p-4 bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">눈 감김</span>
          <span className="text-lg font-bold text-[#0F172A]">{(current.eye_closure * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* 상세 수치 */}
      <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm flex gap-4">
        {[
          { label: '홍조', value: current.redness, color: '#f87171' },
          { label: '창백', value: current.paleness, color: '#94a3b8' },
          { label: '눈감김', value: current.eye_closure, color: '#fbbf24' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex-1 flex flex-col gap-1.5">
            <span className="text-xs text-[#94A3B8]">{label}</span>
            <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: color }} />
            </div>
            <span className="text-xs font-bold text-[#0F172A]">{(value * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-[#1D6FD8]" />
            <span className="text-sm font-bold text-[#0F172A]">30초 상태 추이</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#94A3B8]">
            <Clock size={11} />
            1초 간격
          </div>
        </div>
        <p className="text-xs text-[#94A3B8] mb-4">1=정상 · 2=주의 · 3=위험</p>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={4} />
            <YAxis domain={[0.8, 3.2]} ticks={[1, 2, 3]} tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <ReferenceLine y={1.5} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.4} />
            <ReferenceLine y={2.5} stroke="#EF4444" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Tooltip content={<ChartTooltip />} />
            <Line isAnimationActive={false} type="monotone" dataKey="face" stroke="#f472b6" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            <Line isAnimationActive={false} type="monotone" dataKey="redness" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
            <Line isAnimationActive={false} type="monotone" dataKey="eye_closure" stroke="#fbbf24" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F1F5F9]">
          <span className="text-sm font-bold text-[#0F172A]">30초 구간 요약</span>
        </div>
        <div className="divide-y divide-[#F8FAFC]">
          <div className="flex items-center justify-between px-5 py-3.5">
            <span className="text-sm text-[#475569]">얼굴 최고 위험도</span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: levelCfg[worstFace].bg, color: levelCfg[worstFace].text }}>
              {worstFace === 'normal' ? <Shield size={12} /> : worstFace === 'warning' ? <AlertTriangle size={12} /> : <XOctagon size={12} />}
              {levelCfg[worstFace].label}
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3.5">
            <span className="text-sm text-[#475569]">데이터 소스</span>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${hasRealData ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#F1F5F9] text-[#94A3B8]'}`}>
              {hasRealData ? '실제 CV 데이터' : '대기 중'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
