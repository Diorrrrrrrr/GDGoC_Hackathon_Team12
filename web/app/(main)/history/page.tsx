'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Activity, Shield, AlertTriangle, XOctagon, Clock, Wifi } from 'lucide-react';
import type { StatusLevel } from '@/lib/types';

/* ── types ── */
interface DataPoint {
  t: number;        // seconds ago (0 = now, 30 = 30s ago)
  label: string;    // "30s", "25s", ... "0s"
  body: number;     // 1=normal 2=warning 3=danger
  face: number;
}

/* ── helpers ── */
const WINDOW = 30;

function randomWalk(prev: number, min = 1, max = 3): number {
  const delta = (Math.random() - 0.5) * 0.6;
  return Math.min(max, Math.max(min, prev + delta));
}

function scoreToLevel(s: number): StatusLevel {
  if (s >= 2.5) return 'danger';
  if (s >= 1.5) return 'warning';
  return 'normal';
}

function generateInitial(): DataPoint[] {
  let body = 1, face = 1;
  return Array.from({ length: WINDOW + 1 }, (_, i) => {
    body = randomWalk(body); face = randomWalk(face);
    const t = WINDOW - i;
    return { t, label: t === 0 ? 'now' : `${t}s`, body: +body.toFixed(2), face: +face.toFixed(2) };
  });
}

/* ── custom tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1E293B] rounded-xl px-3 py-2.5 shadow-xl border border-white/10 text-xs">
      <p className="text-white/50 mb-1.5">{label === 'now' ? '현재' : `${label} 전`}</p>
      {[['#60a5fa','신체',payload[0]?.value],['#f472b6','얼굴',payload[1]?.value]].map(([c,l,v]) => (
        <div key={l as string} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: c as string }} />
          <span className="text-white/70">{l as string}</span>
          <span className="text-white font-bold ml-auto pl-3">
            {(v as number) >= 2.5 ? '위험' : (v as number) >= 1.5 ? '주의' : '정상'}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── status badge ── */
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

/* ── main ── */
export default function AnalysisPage() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLive, setIsLive] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setData(generateInitial());
  }, []);

  useEffect(() => {
    if (!isLive) { if (intervalRef.current) clearInterval(intervalRef.current); return; }

    intervalRef.current = setInterval(() => {
      setData(prev => {
        const last = prev[prev.length - 1];
        const newBody = +randomWalk(last.body).toFixed(2);
        const newFace = +randomWalk(last.face).toFixed(2);

        const shifted = prev.slice(1).map((d, i) => ({
          ...d,
          t: WINDOW - i - 1,
          label: WINDOW - i - 1 === 0 ? 'now' : `${WINDOW - i - 1}s`,
        }));
        return [...shifted, { t: 0, label: 'now', body: newBody, face: newFace }];
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isLive]);

  if (data.length === 0) return null;

  const current = data[data.length - 1];
  const bodyLevel = scoreToLevel(current.body);
  const faceLevel = scoreToLevel(current.face);

  const worstBody = scoreToLevel(Math.max(...data.map(d => d.body)));
  const worstFace = scoreToLevel(Math.max(...data.map(d => d.face)));

  return (
    <div className="flex flex-col gap-4 fade-in">

      {/* Header */}
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

      {/* Current status badges */}
      <div className="flex gap-3">
        <StatusBadge level={bodyLevel} title="신체 (Body)" />
        <StatusBadge level={faceLevel} title="얼굴 (Face)" />
      </div>

      {/* Main 30s chart */}
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
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              axisLine={false} tickLine={false}
              interval={4}
            />
            <YAxis
              domain={[0.8, 3.2]}
              ticks={[1, 2, 3]}
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              axisLine={false} tickLine={false}
            />
            {/* Zone lines */}
            <ReferenceLine y={1.5} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.4} />
            <ReferenceLine y={2.5} stroke="#EF4444" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Tooltip content={<ChartTooltip />} />
            <Line
              isAnimationActive={false}
              type="monotone" dataKey="body" stroke="#60a5fa" strokeWidth={2.5}
              dot={false} activeDot={{ r: 5, fill: '#60a5fa' }}
            />
            <Line
              isAnimationActive={false}
              type="monotone" dataKey="face" stroke="#f472b6" strokeWidth={2.5}
              dot={false} activeDot={{ r: 5, fill: '#f472b6' }}
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="flex gap-5 justify-center mt-3">
          {[['#60a5fa','신체 (Body)'],['#f472b6','얼굴 (Face)']].map(([c,l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded-full" style={{ background: c }} />
              <span className="text-xs text-[#64748B]">{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 30s summary */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F1F5F9]">
          <span className="text-sm font-bold text-[#0F172A]">30초 구간 요약</span>
        </div>
        <div className="divide-y divide-[#F8FAFC]">
          {[
            { label: '신체 최고 위험도', level: worstBody },
            { label: '얼굴 최고 위험도', level: worstFace },
          ].map(({ label, level }) => {
            const cfg = levelCfg[level];
            const Icon = cfg.icon;
            return (
              <div key={label} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-[#475569]">{label}</span>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: cfg.bg, color: cfg.text }}>
                  <Icon size={12} strokeWidth={2.5} />
                  {cfg.label}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-5 py-3.5">
            <span className="text-sm text-[#475569]">데이터 포인트</span>
            <span className="text-sm font-bold text-[#0F172A]">{data.length}개</span>
          </div>
        </div>
      </div>

      {/* Backend notice */}
      <div className="rounded-xl px-4 py-3 bg-[#F8FAFC] border border-dashed border-[#CBD5E1] flex items-start gap-2">
        <Wifi size={14} className="text-[#94A3B8] shrink-0 mt-0.5" />
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          현재 시뮬레이션 데이터입니다. 백엔드 <code className="bg-[#E2E8F0] px-1 rounded">GET /status</code> 연동 시 실제 CV 데이터로 교체됩니다.
        </p>
      </div>

    </div>
  );
}
