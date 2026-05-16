'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Monitor, BarChart2, Settings } from 'lucide-react';

const tabs = [
  { href: '/',          label: 'Monitor',  icon: Monitor   },
  { href: '/history',   label: 'Analysis', icon: BarChart2 },
  { href: '/settings',  label: 'Settings', icon: Settings  },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-[#E2E8F0]">
      <div className="max-w-5xl mx-auto px-4 flex gap-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                active
                  ? 'border-[#1D6FD8] text-[#1D6FD8]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-[#CBD5E1]'
              }`}
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
