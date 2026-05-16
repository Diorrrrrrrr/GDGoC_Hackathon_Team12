'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PhoneCall, RefreshCw, User, Phone, QrCode, CheckCircle, LogOut } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';

const PROFILE_IMG = 'https://images.unsplash.com/photo-1634089916298-9fa27180526c?w=300&h=300&fit=crop&crop=face&q=80';

type Step = 'register' | 'qr';

interface ProfileForm {
  name: string;
  phone: string;
  relation: string;
}

const RELATION_OPTIONS = ['어머니', '아버지', '할머니', '할아버지', '기타'];

export default function SettingsPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('register');
  const [form, setForm] = useState<ProfileForm>({ name: '', phone: '', relation: '' });
  const [saved, setSaved] = useState<ProfileForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadContact() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('monitored_contacts')
        .select('name, phone, relation')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setForm(data);
        setSaved(data);
        setStep('qr');
      }
    }
    loadContact();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('monitored_contacts')
      .upsert({ user_id: user.id, ...form, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    setSaved(form);
    setStep('qr');
    setSaving(false);
  }

  const qrValue = saved
    ? JSON.stringify({ name: saved.name, phone: saved.phone, relation: saved.relation, ts: Date.now() })
    : '';

  return (
    <div className="fade-in flex flex-col gap-4 max-w-md mx-auto">

      {step === 'register' ? (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#F1F5F9]">
          <div className="h-20 bg-gradient-to-br from-[#a7f3d0] to-[#34d399] relative overflow-hidden">
            <div className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)',
                backgroundSize: '30px 30px',
              }}
            />
            <div className="absolute top-3 left-4">
              <span className="text-white/90 text-xs font-bold uppercase tracking-widest">Settings</span>
            </div>
          </div>

          <div className="px-5 pb-6 pt-4">
            <div className="flex items-center gap-2 mb-1">
              <User size={16} className="text-[#1D6FD8]" />
              <h2 className="text-base font-bold text-[#0F172A]">모니터링 대상 등록</h2>
            </div>
            <p className="text-xs text-[#94A3B8] mb-5">상대방을 등록해주세요. 등록 후 QR 코드로 연동할 수 있습니다.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                <label className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-1.5 block">전화번호</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#1D6FD8]/30 focus:border-[#1D6FD8] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-1.5 block">관계</label>
                <div className="flex gap-2 flex-wrap">
                  {RELATION_OPTIONS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, relation: r }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        form.relation === r
                          ? 'bg-[#DBEAFE] text-[#1D4ED8] border-[#93c5fd]'
                          : 'bg-[#F8FAFC] text-[#94A3B8] border-[#E2E8F0]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1D6FD8] text-white text-sm font-bold hover:bg-[#1a63c4] active:scale-95 transition-all shadow-md shadow-[#1D6FD8]/25 mt-1 disabled:opacity-60"
              >
                <QrCode size={16} strokeWidth={2.5} />
                {saving ? '저장 중...' : '등록하고 QR 코드 생성'}
              </button>
            </form>
          </div>
        </div>

      ) : (
        <>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#F1F5F9]">
            <div className="h-20 bg-gradient-to-br from-[#a7f3d0] to-[#34d399] relative overflow-hidden">
              <div className="absolute top-3 left-4">
                <span className="text-white/90 text-xs font-bold uppercase tracking-widest">Settings</span>
              </div>
              <button
                onClick={() => setStep('register')}
                className="absolute top-3 right-4 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <RefreshCw size={12} className="text-white" strokeWidth={2.5} />
              </button>
            </div>

            <div className="px-5 pb-5 pt-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9] mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22C55E] to-[#86efac] p-[2px] shadow">
                  <img src={PROFILE_IMG} alt="" className="w-full h-full rounded-full object-cover" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-[#0F172A] text-sm">{saved?.name}</p>
                  <p className="text-xs text-[#94A3B8]">{saved?.relation} · {saved?.phone}</p>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#DCFCE7]">
                  <CheckCircle size={12} className="text-[#22C55E]" />
                  <span className="text-[10px] font-bold text-[#15803D]">등록됨</span>
                </div>
              </div>

              <button
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-md"
                style={{ background: '#22C55E', boxShadow: '0 4px 14px #22C55E55' }}
              >
                <PhoneCall size={14} strokeWidth={2.5} />
                영상 통화
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#F1F5F9] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center gap-2">
              <QrCode size={15} className="text-[#1D6FD8]" />
              <span className="text-sm font-bold text-[#0F172A]">보호자 연동 QR</span>
            </div>
            <div className="px-5 py-6 flex flex-col items-center gap-4">
              <div className="p-4 bg-white rounded-2xl border-2 border-[#E2E8F0] shadow-inner">
                <QRCodeSVG value={qrValue} size={200} level="M" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-[#0F172A]">보호자에게 스캔하도록 요청하세요</p>
                <p className="text-xs text-[#94A3B8] mt-1">보호자가 이 QR을 스캔하면 자동으로 연동됩니다</p>
              </div>
              <button
                onClick={() => setStep('register')}
                className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-[#475569] transition-colors"
              >
                <RefreshCw size={12} />
                정보 수정
              </button>
            </div>
          </div>
        </>
      )}

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-[#FCA5A5] text-[#EF4444] text-sm font-bold hover:bg-[#FEE2E2] active:scale-95 transition-all"
      >
        <LogOut size={15} strokeWidth={2.5} />
        로그아웃
      </button>
    </div>
  );
}
