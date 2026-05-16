'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E2E8F0] shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-[#1D6FD8] flex items-center justify-center shadow-sm">
            <Activity size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="font-bold text-[#0F172A] text-base tracking-tight">CareWatch</span>
            <span className="ml-1.5 text-xs text-[#64748B] font-medium">by Team 12</span>
          </div>
        </Link>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#DCFCE7] rounded-full">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] blink" />
          <span className="text-xs font-semibold text-[#15803D]">LIVE</span>
        </div>
      </div>
    </header>
  );
}
