'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Monitor, BarChart2, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'carewatch_read_notifs';

function getUnreadCount(): number {
  try {
    const readIds = new Set<string>(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
    const raw = JSON.parse(sessionStorage.getItem('carewatch_notif_ids') ?? '[]') as string[];
    return raw.filter(id => !readIds.has(id)).length;
  } catch { return 0; }
}

const tabs = [
  { href: '/',              label: 'Monitor',  icon: Monitor   },
  { href: '/history',       label: 'Analysis', icon: BarChart2 },
  { href: '/notifications', label: 'Alerts',   icon: Bell      },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const UNREAD_CUTOFF = 10 * 60 * 1000;

    async function refresh() {
      const { data } = await supabase
        .from('face_metrics')
        .select('id, redness, paleness, eye_closure, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!data) return;

      const WINDOW_MS = 2 * 60 * 1000;
      const alertIds: string[] = [];
      const lastAlertTime: Record<string, number> = {};

      for (const row of data as { id: string; redness: number; paleness: number; eye_closure: number; created_at: string }[]) {
        const ts = new Date(row.created_at).getTime();
        const checks: { key: string }[] = [];
        if (row.eye_closure > 0.4) checks.push({ key: `stroke-${row.id}` });
        if (row.redness >= 0.63)   checks.push({ key: `heat-${row.id}` });
        if (row.paleness < 0.45)   checks.push({ key: `pale-${row.id}` });

        const typeKeys = [
          { cond: row.eye_closure > 0.4, key: 'stroke' },
          { cond: row.redness >= 0.63,   key: 'heat'   },
          { cond: row.paleness < 0.45,   key: 'pale'   },
        ];
        for (const { cond, key } of typeKeys) {
          if (!cond) continue;
          const last = lastAlertTime[key] ?? 0;
          if (ts - last > WINDOW_MS) {
            alertIds.push(`${row.id}-${key}`);
            lastAlertTime[key] = ts;
          }
        }
      }

      sessionStorage.setItem('carewatch_notif_ids', JSON.stringify(alertIds));

      const readIds = new Set<string>(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
      const recentUnread = alertIds.filter(id => {
        if (readIds.has(id)) return false;
        const rowId = id.split('-').slice(0, 5).join('-');
        const row = (data as { id: string; created_at: string }[]).find(r => r.id === rowId);
        if (!row) return false;
        return Date.now() - new Date(row.created_at).getTime() < UNREAD_CUTOFF;
      });
      setUnread(recentUnread.length);
    }

    refresh();
    const timer = setInterval(refresh, 10000);
    window.addEventListener('storage', refresh);
    return () => { clearInterval(timer); window.removeEventListener('storage', refresh); };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E2E8F0] sm:hidden">
      <div className="flex items-stretch h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          const isBell = href === '/notifications';
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors ${
                active ? 'text-[#1D6FD8]' : 'text-[#94A3B8]'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#1D6FD8] rounded-full" />
              )}
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                {isBell && unread > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-[#EF4444] rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold ${active ? 'text-[#1D6FD8]' : 'text-[#94A3B8]'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
