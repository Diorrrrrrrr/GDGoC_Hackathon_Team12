'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Monitor, BarChart2 } from 'lucide-react';

const tabs = [
  { href: '/',        label: 'Monitor',  icon: Monitor   },
  { href: '/history', label: 'Analysis', icon: BarChart2 },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E2E8F0] sm:hidden">
      <div className="flex items-stretch h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
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
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
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
