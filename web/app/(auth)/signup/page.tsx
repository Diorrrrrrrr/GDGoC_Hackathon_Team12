'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Eye, EyeOff, UserPlus, Heart, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Role = 'elder' | 'caregiver';

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('caregiver');
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name, role } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#1D6FD8] flex items-center justify-center shadow-lg shadow-[#1D6FD8]/30">
          <Activity size={20} className="text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-bold text-[#0F172A] text-lg leading-tight">CareWatch</p>
          <p className="text-[10px] text-[#94A3B8] leading-none">실시간 건강 모니터링</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-black/5 border border-[#F1F5F9] p-6">
        <h1 className="text-xl font-bold text-[#0F172A] mb-1">회원가입</h1>
        <p className="text-sm text-[#94A3B8] mb-5">새 계정을 만드세요</p>

        {/* 역할 선택 */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setRole('caregiver')}
            className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
              role === 'caregiver'
                ? 'border-[#1D6FD8] bg-[#EFF6FF]'
                : 'border-[#E2E8F0] bg-[#F8FAFC]'
            }`}
          >
            <Shield size={20} className={role === 'caregiver' ? 'text-[#1D6FD8]' : 'text-[#94A3B8]'} strokeWidth={2} />
            <span className={`text-xs font-bold ${role === 'caregiver' ? 'text-[#1D4ED8]' : 'text-[#94A3B8]'}`}>보호자</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('elder')}
            className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
              role === 'elder'
                ? 'border-[#22C55E] bg-[#F0FDF4]'
                : 'border-[#E2E8F0] bg-[#F8FAFC]'
            }`}
          >
            <Heart size={20} className={role === 'elder' ? 'text-[#22C55E]' : 'text-[#94A3B8]'} strokeWidth={2} />
            <span className={`text-xs font-bold ${role === 'elder' ? 'text-[#15803D]' : 'text-[#94A3B8]'}`}>어르신</span>
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-1.5 block">이름</label>
            <input
              type="text"
              placeholder="홍길동"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#1D6FD8]/30 focus:border-[#1D6FD8] transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-1.5 block">이메일</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#1D6FD8]/30 focus:border-[#1D6FD8] transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-1.5 block">비밀번호</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#1D6FD8]/30 focus:border-[#1D6FD8] transition-all"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-[#EF4444] bg-[#FEE2E2] px-3 py-2 rounded-lg">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold active:scale-95 transition-all shadow-md mt-1 disabled:opacity-60 disabled:cursor-not-allowed ${
              role === 'elder'
                ? 'bg-[#22C55E] hover:bg-[#16a34a] shadow-[#22C55E]/25'
                : 'bg-[#1D6FD8] hover:bg-[#1a63c4] shadow-[#1D6FD8]/25'
            }`}>
            <UserPlus size={16} strokeWidth={2.5} />
            {loading ? '가입 중...' : '가입하기'}
          </button>
        </form>

        {/* 어르신 QR 로그인 */}
        {role === 'elder' && (
          <div className="mt-4 p-3 rounded-xl bg-[#F0FDF4] border border-[#bbf7d0] text-center">
            <p className="text-xs text-[#15803D] font-medium">스마트폰이 불편하신가요?</p>
            <Link href="/login" className="text-xs text-[#16a34a] font-bold hover:underline">
              보호자가 QR로 대신 로그인해드릴 수 있어요 →
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-[#94A3B8] mt-4">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-[#1D6FD8] font-bold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  );
}
