'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Activity } from 'lucide-react';
import { mockNotifications } from '@/lib/mockData';

export default function Header() {
  const pathname = usePathname();
  const unread = mockNotifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E2E8F0] shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-[#1D6FD8] flex items-center justify-center shadow-sm">
            <Activity size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="font-bold text-[#0F172A] text-base tracking-tight">CareWatch</span>
            <span className="ml-1.5 text-xs text-[#64748B] font-medium">by Team 12</span>
          </div>
        </Link>

        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#DCFCE7] rounded-full">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] blink" />
          <span className="text-xs font-semibold text-[#15803D]">LIVE</span>
        </div>

        {/* Notification bell */}
        <Link
          href="/notifications"
          className={`relative p-2 rounded-xl transition-colors ${
            pathname === '/notifications'
              ? 'bg-[#EFF6FF] text-[#1D6FD8]'
              : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
          }`}
        >
          <Bell size={22} strokeWidth={2} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#EF4444] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
