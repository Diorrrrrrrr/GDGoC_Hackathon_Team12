'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Eye, EyeOff, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
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
        <h1 className="text-xl font-bold text-[#0F172A] mb-1">로그인</h1>
        <p className="text-sm text-[#94A3B8] mb-6">계정에 로그인하세요</p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-1.5 block">이메일</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
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
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                required
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
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1D6FD8] text-white text-sm font-bold hover:bg-[#1a63c4] active:scale-95 transition-all shadow-md shadow-[#1D6FD8]/25 mt-1 disabled:opacity-60 disabled:cursor-not-allowed">
            <LogIn size={16} strokeWidth={2.5} />
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-xs text-[#94A3B8] mt-5">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="text-[#1D6FD8] font-bold hover:underline">회원가입</Link>
        </p>
      </div>
    </div>
  );
}
